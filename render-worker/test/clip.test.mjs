import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
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
  expect(JSON.parse(Buffer.from(header, "base64url"))).toStrictEqual({
    alg: "HS256",
    typ: "JWT",
  });
  expect(JSON.parse(Buffer.from(payload, "base64url"))).toStrictEqual({
    iss: "ak",
    exp: 2800,
    nbf: 995,
  });
  expect(signature).toBe(
    createHmac("sha256", "sk")
      .update(`${header}.${payload}`)
      .digest("base64url"),
  );
});

test("Kling durations round to the 5 s and 10 s clips the API offers, and cost follows", () => {
  expect(klingDuration(3)).toBe("5");
  expect(klingDuration(5)).toBe("5");
  expect(klingDuration(7)).toBe("10");
  const provider = klingProvider();
  expect(provider.estimate({ durationS: 4 })).toStrictEqual({
    credits: 5100,
    usd: 0.85,
  });
  expect(provider.estimate({ durationS: 8 })).toStrictEqual({
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
    expect(provider.name).toBe("kling");
    expect(
      await provider.submit({ imageUrl: "https://x/a.png", prompt: "p" }),
    ).toStrictEqual({ jobId: "t1" });
    const [, payload] = auth.replace("Bearer ", "").split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString()).iss).toBe(
      "tenant-ak",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a half-saved tenant Kling pair fails instead of using the env pair", async () => {
  process.env.KLING_ACCESS_KEY = "env-ak";
  process.env.KLING_SECRET_KEY = "env-sk";
  try {
    const provider = getVideoProvider("kling", { klingAccessKey: "tenant-ak" });
    await expect(
      provider.submit({ imageUrl: "https://x/a.png", prompt: "p" }),
    ).rejects.toThrow(/both the Access Key and the Secret Key/);
  } finally {
    delete process.env.KLING_ACCESS_KEY;
    delete process.env.KLING_SECRET_KEY;
  }
});

test("clip prompts always end with the no-text rule", () => {
  expect(clipPrompt("Camera dollies in")).toBe(
    "Camera dollies in No text, no letters, no logos.",
  );
  expect(clipPrompt("")).toMatch(/push-in\. No text, no letters, no logos\.$/);
});

test("unknown providers are rejected and mock is the default", () => {
  expect(() => getVideoProvider("nope")).toThrow(/Unknown VIDEO_PROVIDER/);
  expect(getVideoProvider("mock").name).toBe("mock");
});

test.skipIf(!hasFfmpeg)(
  "the mock provider renders an MP4 of the requested length",
  async () => {
    const bytes = await kenBurnsClip(stillPng(), {
      durationS: 1,
      aspect: "9:16",
      fps: 10,
    });
    expect(Buffer.from(bytes.slice(4, 8)).toString()).toBe("ftyp");
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
    upload: async (bucket, path, bytes, contentType) =>
      calls.uploads.push({
        bucket,
        path,
        size: bytes.length,
        bytes,
        contentType,
      }),
    sign: async (bucket, path) => `https://p.supabase.co/sign/${path}`,
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

test.skipIf(!hasFfmpeg)(
  "seven clips run in parallel and one failure leaves the other six",
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
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(6);
    expect(results[3].reason.message).toMatch(/rejected the image/);
    expect(db.calls.uploads.length).toBe(6);
    expect(
      db.calls.uploads.every(
        (u) =>
          u.bucket === "creative-video" &&
          /^t1\/c1\/i1\/s\d\/clip-v1\.mp4$/.test(u.path),
      ),
    ).toBeTruthy();
    const attach = db.calls.rpcs.find((call) => call.args.p_scene_id === "s0");
    expect(attach.name).toBe("attach_video_scene_asset");
    expect(attach.args.p_kind).toBe("clip");
    expect(attach.args.p_meta.provider).toBe("mock");
    expect(attach.args.p_run_id).toBe("run-s0");

    await failClip({ db, run: runs[3] });
    expect(db.calls.updates.at(-1)).toStrictEqual({
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
  expect(submits).toBe(0);
  expect(result.output.job_id).toBe("task-42");
  expect(result.costUsd).toBe(0.85);
  expect(result.credits).toBe(5100);
});

test("worker guards keep paths in the tenant folder and fetches on media hosts", async () => {
  const { assertTenantPath, assertMediaUrl, safeSegment } =
    await import("../src/guard.mjs");
  expect(assertTenantPath("t1", "t1/c1/i1/clip.mp4")).toBe("t1/c1/i1/clip.mp4");
  expect(() => assertTenantPath("t1", "t1/../t2/clip.mp4")).toThrow(
    /outside the tenant/,
  );
  expect(() => assertTenantPath("t1", "t2/c/i/clip.mp4")).toThrow(
    /outside the tenant/,
  );
  expect(() => assertTenantPath("t1", "t1//x")).toThrow(/outside the tenant/);
  expect(safeSegment("../../t2")).toBe("general");
  expect(safeSegment("c1-ab_9")).toBe("c1-ab_9");
  expect(assertMediaUrl("https://abc.supabase.co/storage/v1/x")).toBe(
    "https://abc.supabase.co/storage/v1/x",
  );
  expect(() => assertMediaUrl("http://abc.supabase.co/x")).toThrow(
    /not allowed/,
  );
  expect(() => assertMediaUrl("https://169.254.169.254/latest")).toThrow(
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
  await expect(
    generateClip({
      db,
      run: clipRun("s1", { tenant_id: "t2" }),
      provider,
      log: () => {},
    }),
  ).rejects.toThrow(/not in the run's tenant/);
  expect(submitted).toBe(false);
});

/** A provider that records what it is sent and answers each poll with `answer`. */
function recordingProvider(answer, extra = {}) {
  const seen = { submits: [], polls: 0 };
  return {
    seen,
    provider: {
      name: "openrouter",
      model: "m",
      estimate: () => ({ credits: 0, usd: 0 }),
      submit: async (input) => (seen.submits.push(input), { jobId: "job-1" }),
      poll: async () => (seen.polls++, answer),
      ...extra,
    },
  };
}

test("a provider job that failed is final, so a retry does not poll the dead job again", async () => {
  const db = fakeDb({ still: new Uint8Array([1]) });
  const { provider, seen } = recordingProvider({
    status: "failed",
    error: "Content policy violation",
  });
  await assert.rejects(
    generateClip({ db, run: clipRun("s1"), provider, log: () => {} }),
    (error) =>
      error.final === true &&
      error.submitted === true &&
      /Content policy violation/.test(error.message),
  );
  assert.equal(seen.polls, 1);
});

test("a failed free-preview clip may be retried, since a retry renders a new one", async () => {
  const db = fakeDb({ still: new Uint8Array([1]) });
  const { provider } = recordingProvider(
    { status: "failed", error: "ffmpeg null: killed" },
    { name: "mock" },
  );
  await assert.rejects(
    generateClip({ db, run: clipRun("s1"), provider, log: () => {} }),
    (error) => error.final !== true && /killed/.test(error.message),
  );
});

const done = { status: "succeeded", bytes: new Uint8Array([0, 0, 0, 0]) };

test("the still copy an engine fetches carries the still's real type", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const db = fakeDb({ still: jpeg });
  const { provider, seen } = recordingProvider(done, {
    needsPublicImage: true,
  });
  await generateClip({ db, run: clipRun("s1"), provider, log: () => {} });
  const [copy] = db.calls.uploads;
  assert.equal(copy.path, "t1/c1/i1/s1/still-source-run-s1.jpg");
  assert.equal(copy.contentType, "image/jpeg");
  assert.match(seen.submits[0].imageUrl, /still-source-run-s1\.jpg$/);
});

/** A small WebP made with ffmpeg; empty when ffmpeg cannot write WebP. */
function stillWebp() {
  const result = spawnSync(
    "ffmpeg",
    [
      ...["-hide_banner", "-loglevel", "error", "-f", "lavfi"],
      ...["-i", "testsrc2=size=64x64", "-frames:v", "1"],
      ...["-c:v", "libwebp", "-f", "webp", "-"],
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return result.status === 0 ? new Uint8Array(result.stdout) : new Uint8Array();
}
const webp = hasFfmpeg ? stillWebp() : new Uint8Array();

test(
  "a WebP still is handed to the engine as a PNG",
  { skip: !webp.length },
  async () => {
    const db = fakeDb({ still: webp });
    const { provider } = recordingProvider(done, { needsPublicImage: true });
    await generateClip({ db, run: clipRun("s1"), provider, log: () => {} });
    const [copy] = db.calls.uploads;
    assert.equal(copy.path, "t1/c1/i1/s1/still-source-run-s1.png");
    assert.equal(copy.contentType, "image/png");
    assert.deepEqual([...copy.bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  },
);

test("the paid submit and the save of its job id run inside the worker's submit guard", async () => {
  const db = fakeDb({ still: new Uint8Array([1]) });
  let inside = false;
  const seen = [];
  const update = db.update;
  db.update = async (table, query, patch) => {
    seen.push(["save", inside]);
    return update(table, query, patch);
  };
  const { provider } = recordingProvider(done, {
    submit: async () => (seen.push(["submit", inside]), { jobId: "job-1" }),
  });
  await generateClip({
    db,
    run: clipRun("s1"),
    provider,
    log: () => {},
    submitting: async (submit) => {
      inside = true;
      try {
        return await submit();
      } finally {
        inside = false;
      }
    },
  });
  assert.deepEqual(seen, [
    ["submit", true],
    ["save", true],
  ]);
});
