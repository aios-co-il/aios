import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { generateClip, failClip } from "../src/jobs/clip.mjs";
import {
  klingDuration,
  klingProvider,
  klingToken,
} from "../src/providers/kling.mjs";
import { clipPrompt, getVideoProvider } from "../src/providers/index.mjs";
import { kenBurnsClip, mockProvider } from "../src/providers/mock.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

/** A small PNG made with ffmpeg, so the mock provider has a real still to animate. */
function stillPng() {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x240",
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "-",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return new Uint8Array(result.stdout);
}

test("klingToken is an HS256 JWT signed with the secret key", () => {
  const token = klingToken("ak", "sk", 1000);
  const [header, payload, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), {
    alg: "HS256",
    typ: "JWT",
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
    iss: "ak",
    exp: 2800,
    nbf: 995,
  });
  assert.equal(
    signature,
    createHmac("sha256", "sk")
      .update(`${header}.${payload}`)
      .digest("base64url"),
  );
});

test("Kling durations round to the 5 s and 10 s clips the API offers, and cost follows", () => {
  assert.equal(klingDuration(3), "5");
  assert.equal(klingDuration(5), "5");
  assert.equal(klingDuration(7), "10");
  const provider = klingProvider();
  assert.deepEqual(provider.estimate({ durationS: 4 }), {
    credits: 5100,
    usd: 0.85,
  });
  assert.deepEqual(provider.estimate({ durationS: 8 }), {
    credits: 10200,
    usd: 1.7,
  });
});

test("clip prompts always end with the no-text rule", () => {
  assert.equal(
    clipPrompt("Camera dollies in"),
    "Camera dollies in No text, no letters, no logos.",
  );
  assert.match(clipPrompt(""), /push-in\. No text, no letters, no logos\.$/);
});

test("unknown providers are rejected and mock is the default", () => {
  assert.throws(() => getVideoProvider("nope"), /Unknown VIDEO_PROVIDER/);
  assert.equal(getVideoProvider("mock").name, "mock");
});

test(
  "the mock provider renders an MP4 of the requested length",
  { skip: !hasFfmpeg },
  async () => {
    const bytes = await kenBurnsClip(stillPng(), {
      durationS: 1,
      aspect: "9:16",
      fps: 10,
    });
    assert.equal(Buffer.from(bytes.slice(4, 8)).toString(), "ftyp");
  },
);

/** In-memory stand-in for supabaseRest: records uploads, attaches and updates. */
function fakeDb({ still }) {
  const calls = { uploads: [], rpcs: [], updates: [] };
  return {
    calls,
    download: async () => still,
    select: async () => [],
    upload: async (bucket, path, bytes) =>
      calls.uploads.push({ bucket, path, size: bytes.length }),
    rpc: async (name, args) => calls.rpcs.push({ name, args }),
    update: async (table, query, patch) =>
      calls.updates.push({ table, query, patch }),
  };
}

const clipRun = (sceneId, extra = {}) => ({
  id: `run-${sceneId}`,
  tenant_id: "t1",
  item_id: "i1",
  scene_id: sceneId,
  kind: "clip",
  input: {
    still_url: "t1/c1/i1/still.png",
    client_id: "c1",
    motion_prompt: "Slow push in",
    duration_s: 1,
    aspect: "1:1",
  },
  ...extra,
});

test(
  "seven clips run in parallel and one failure leaves the other six",
  { skip: !hasFfmpeg },
  async () => {
    const db = fakeDb({ still: stillPng() });
    const mock = mockProvider();
    const failing = {
      ...mock,
      submit: async (input) => {
        if (input.prompt.startsWith("BROKEN"))
          throw new Error("provider rejected the image");
        return mock.submit(input);
      },
    };
    const runs = Array.from({ length: 7 }, (_, index) =>
      clipRun(
        `s${index}`,
        index === 3
          ? { input: { ...clipRun("x").input, motion_prompt: "BROKEN" } }
          : {},
      ),
    );
    const results = await Promise.allSettled(
      runs.map((run) =>
        generateClip({ db, run, provider: failing, log: () => {} }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 6);
    assert.match(results[3].reason.message, /rejected the image/);
    assert.equal(db.calls.uploads.length, 6);
    assert.ok(
      db.calls.uploads.every(
        (u) =>
          u.bucket === "creative-video" &&
          /^t1\/c1\/i1\/s\d\/clip-v1\.mp4$/.test(u.path),
      ),
    );
    const attach = db.calls.rpcs.find((call) => call.args.p_scene_id === "s0");
    assert.equal(attach.name, "attach_video_scene_asset");
    assert.equal(attach.args.p_kind, "clip");
    assert.equal(attach.args.p_meta.provider, "mock");
    assert.equal(attach.args.p_run_id, "run-s0");

    await failClip({ db, run: runs[3] });
    assert.deepEqual(db.calls.updates.at(-1), {
      table: "marketing_video_scenes",
      query: "id=eq.s3&status=eq.clip_generating",
      patch: { status: "failed" },
    });
  },
);

test("a retried run resumes its provider job instead of paying twice", async () => {
  const db = fakeDb({ still: new Uint8Array([1]) });
  let submits = 0;
  const provider = {
    name: "kling",
    model: "kling-v3",
    estimate: () => ({ credits: 5100, usd: 0.85 }),
    submit: async () => (submits++, { jobId: "new" }),
    poll: async (jobId) => ({
      status: "succeeded",
      bytes: new Uint8Array([0, 0, 0, 0]),
      jobId,
    }),
  };
  const result = await generateClip({
    db,
    run: clipRun("s1", { provider: "kling", provider_job_id: "task-42" }),
    provider,
    log: () => {},
  });
  assert.equal(submits, 0);
  assert.equal(result.output.job_id, "task-42");
  assert.equal(result.costUsd, 0.85);
  assert.equal(result.credits, 5100);
});
