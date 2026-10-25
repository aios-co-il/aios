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

test("Kling signs with the tenant's own key pair before the env pair", async () => {
  const realFetch = globalThis.fetch;
  let auth = "";
  globalThis.fetch = async (_url, init) => {
    auth = init.headers.Authorization;
    return new Response(JSON.stringify({ code: 0, data: { task_id: "t1" } }));
  };
  try {
    const provider = getVideoProvider("kling", {
      klingAccessKey: "tenant-ak",
      klingSecretKey: "tenant-sk",
    });
    assert.equal(provider.name, "kling");
    assert.deepEqual(
      await provider.submit({ imageUrl: "https://x/a.png", prompt: "p" }),
      { jobId: "t1" },
    );
    const [, payload] = auth.replace("Bearer ", "").split(".");
    assert.equal(
      JSON.parse(Buffer.from(payload, "base64url").toString()).iss,
      "tenant-ak",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
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
    // The run's item, scene and still, as the guard reads them for the run's tenant.
    select: async (table, query) => {
      if (!query.includes("tenant_id=eq.t1")) return [];
      if (table === "marketing_work_items")
        return [{ id: "i1", tenant_id: "t1", client_id: "c1" }];
      if (table === "marketing_video_scenes") {
        const id = /id=eq\.([^&]+)/.exec(query)?.[1];
        return [{ id, still_asset_id: "still-1" }];
      }
      if (table === "marketing_assets" && query.includes("id=eq.still-1"))
        return [{ id: "still-1", url: "t1/c1/i1/still.png" }];
      return [];
    },
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
      query: "id=eq.s3&tenant_id=eq.t1&status=eq.clip_generating",
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

test("worker guards keep paths in the tenant folder and fetches on media hosts", async () => {
  const { assertTenantPath, assertMediaUrl, safeSegment } =
    await import("../src/guard.mjs");
  assert.equal(
    assertTenantPath("t1", "t1/c1/i1/clip.mp4"),
    "t1/c1/i1/clip.mp4",
  );
  assert.throws(
    () => assertTenantPath("t1", "t1/../t2/clip.mp4"),
    /outside the tenant/,
  );
  assert.throws(
    () => assertTenantPath("t1", "t2/c/i/clip.mp4"),
    /outside the tenant/,
  );
  assert.throws(() => assertTenantPath("t1", "t1//x"), /outside the tenant/);
  assert.equal(safeSegment("../../t2"), "general");
  assert.equal(safeSegment("c1-ab_9"), "c1-ab_9");
  assert.equal(
    assertMediaUrl("https://abc.supabase.co/storage/v1/x"),
    "https://abc.supabase.co/storage/v1/x",
  );
  assert.throws(
    () => assertMediaUrl("http://abc.supabase.co/x"),
    /not allowed/,
  );
  assert.throws(
    () => assertMediaUrl("https://169.254.169.254/latest"),
    /not allowed/,
  );
});

test("a clip run for a scene outside the run's tenant is refused before any provider call", async () => {
  const db = fakeDb({ still: new Uint8Array([1]) });
  let submitted = false;
  const provider = {
    name: "kling",
    model: "m",
    estimate: () => ({ credits: 0, usd: 0 }),
    submit: async () => ((submitted = true), { jobId: "x" }),
    poll: async () => ({ status: "succeeded", bytes: new Uint8Array([0]) }),
  };
  await assert.rejects(
    generateClip({
      db,
      run: clipRun("s1", { tenant_id: "t2" }),
      provider,
      log: () => {},
    }),
    /not in the run's tenant/,
  );
  assert.equal(submitted, false);
});
