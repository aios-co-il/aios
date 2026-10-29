import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assembleWithRemotion } from "../src/compose/remotion.mjs";

/** A render job that never ends, and starts a helper of its own as Remotion starts a browser. */
const HANGING_JOB = `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const helper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync("pids", JSON.stringify([process.pid, helper.pid]));
setInterval(() => {}, 1000);
`;

/** The process no longer runs: it is gone, or a zombie (killed, not yet reaped by its parent). */
const gone = (pid) => {
  try {
    process.kill(pid, 0);
  } catch {
    return true;
  }
  try {
    return /\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return false;
  }
};

const waitUntil = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end)
    await new Promise((resolve) => setTimeout(resolve, 50));
  return check();
};

test("a render that runs past its time limit is stopped, with the processes it started", async () => {
  const dir = await mkdtemp(join(tmpdir(), "remotion-timeout-"));
  const remotionDir = await mkdtemp(join(tmpdir(), "remotion-job-"));
  const previous = process.env.REMOTION_DIR;
  process.env.REMOTION_DIR = remotionDir;
  try {
    await writeFile(join(remotionDir, "render-job.mjs"), HANGING_JOB);
    const still = join(dir, "still.png");
    await writeFile(still, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const timeline = {
      aspect: "9:16",
      scenes: [
        {
          id: "a",
          clipPath: still,
          stillPath: still,
          clipProvider: "mock",
          durationS: 1,
          overlayText: "",
          voiceoverText: "",
        },
      ],
    };
    await expect(
      assembleWithRemotion(timeline, join(dir, "film.mp4"), dir, {
        probeFile: async () => ({ duration: 1, hasAudio: false }),
        prepare: async (value) => value,
        timeoutMs: 1500,
      }),
    ).rejects.toThrow(/timed out/);
    const [job, helper] = JSON.parse(
      await readFile(join(remotionDir, "pids"), "utf8"),
    );
    expect(await waitUntil(() => gone(job))).toBe(true);
    expect(await waitUntil(() => gone(helper))).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.REMOTION_DIR;
    else process.env.REMOTION_DIR = previous;
    await rm(dir, { recursive: true, force: true });
    await rm(remotionDir, { recursive: true, force: true });
  }
}, 15_000);
