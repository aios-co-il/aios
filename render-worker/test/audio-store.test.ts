import { describe, expect, test } from "vitest";
import {
  alreadyGenerated,
  assetPath,
  generateOnce,
} from "../src/jobs/audio-store.ts";

const TENANT = "11111111-1111-1111-1111-111111111111";

/** A database that records uploads and run updates; `failUpload` makes the upload throw. */
function fakeDb(failUpload = false) {
  const calls: Array<string> = [];
  return {
    calls,
    async upload(_bucket: string, path: string) {
      if (failUpload) {
        throw new Error("storage down");
      }
      calls.push(`upload ${path}`);
    },
    async update(table: string, query: string) {
      calls.push(`update ${table}?${query}`);
    },
  };
}

describe("assetPath", () => {
  test("names one file per run under the tenant's item folder", () => {
    const run = { tenant_id: TENANT, scene_id: null, id: "run-1" };
    expect(assetPath(run, `${TENANT}/item-1`, "voice", "narration")).toBe(
      `${TENANT}/item-1/narration/voice-run-1.mp3`,
    );
  });
});

describe("generateOnce", () => {
  test("pays once, stores the audio and records its path on the run", async () => {
    const db = fakeDb();
    let paid = 0;
    const run = { id: "run-1", output: {} };
    const meta = await generateOnce({
      db,
      run,
      path: "p.mp3",
      generate: async () => {
        paid += 1;
        return { bytes: new Uint8Array([1]), meta: { characters: 5 } };
      },
    });
    expect(meta).toStrictEqual({ characters: 5 });
    expect(paid).toBe(1);
    expect(db.calls).toStrictEqual([
      "upload p.mp3",
      "update marketing_runs?id=eq.run-1",
    ]);
  });

  test("reuses audio an earlier attempt stored, without paying again", async () => {
    const run = {
      id: "run-1",
      output: { audio_path: "p.mp3", audio_meta: { characters: 5 } },
    };
    expect(alreadyGenerated(run, "p.mp3")).toBe(true);
    const meta = await generateOnce({
      db: fakeDb(),
      run,
      path: "p.mp3",
      generate: async () => {
        throw new Error("must not pay");
      },
    });
    expect(meta).toStrictEqual({ characters: 5 });
  });

  test("a failed upload after the payment is final, not retried", async () => {
    await expect(
      generateOnce({
        db: fakeDb(true),
        run: { id: "run-1", output: {} },
        path: "p.mp3",
        generate: async () => ({ bytes: new Uint8Array([1]) }),
      }),
    ).rejects.toThrow(/not retried to avoid paying again/);
  });
});
