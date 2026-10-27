import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { privateStoragePath } from "../src/guard.mjs";
import { renderFilm } from "../src/jobs/render.mjs";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "33333333-3333-3333-3333-333333333333";
const ITEM = "22222222-2222-2222-2222-222222222222";
const PROJECT = "https://proj.supabase.co";
const attachment = (path) =>
  `${PROJECT}/storage/v1/object/public/entity-attachments/${path}`;

test("a link to the project's entity-attachments bucket reads as its bucket and path", () => {
  const path = `${TENANT}/workshop/${ITEM}/1793_carmen logo.png`;
  expect(
    privateStoragePath(attachment(encodeURI(path)), PROJECT),
  ).toStrictEqual({ bucket: "entity-attachments", path });
  // A signed link of the same file, with its token.
  expect(
    privateStoragePath(
      `${PROJECT}/storage/v1/object/sign/entity-attachments/${TENANT}/a.png?token=abc`,
      PROJECT,
    ),
  ).toStrictEqual({ bucket: "entity-attachments", path: `${TENANT}/a.png` });
  // Another project, another bucket, or not a storage link: fetched as a plain link.
  expect(
    privateStoragePath(
      `https://other.supabase.co/storage/v1/object/public/entity-attachments/${TENANT}/a.png`,
      PROJECT,
    ),
  ).toBe(null);
  expect(
    privateStoragePath(
      `${PROJECT}/storage/v1/object/public/brand-assets/${TENANT}/a.png`,
      PROJECT,
    ),
  ).toBe(null);
  expect(privateStoragePath("https://cdn.example.com/a.png", PROJECT)).toBe(
    null,
  );
  expect(privateStoragePath(attachment(`${TENANT}/a.png`), "")).toBe(null);
});

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const media = (args) => {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...args,
  ]);
  if (result.status !== 0) throw new Error(String(result.stderr));
};
/** The mean colour [r, g, b] of a small box at (x, y) as shares of the frame, at `atS`. */
const colourAt = (file, atS, x, y) => {
  const out = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(atS),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      `crop=16:16:iw*${x}-8:ih*${y}-8,scale=1:1`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 20 },
  );
  return [...out.stdout];
};

/** One render's database: two scenes with clips, the item's payload, and every download. */
function renderDb(dir, payload) {
  const stored = new Map();
  const downloads = [];
  const clipPath = (id) => `${TENANT}/general/${ITEM}/${id}.mp4`;
  return {
    stored,
    downloads,
    async select(table, query) {
      if (table === "marketing_work_items")
        return query.includes("select=payload")
          ? [{ payload }]
          : [{ id: ITEM, tenant_id: TENANT, client_id: null }];
      if (table === "marketing_video_scenes")
        return ["c1", "c2"].map((clip, index) => ({
          id: `s${index + 1}`,
          position: index + 1,
          overlay_text: "",
          voiceover_text: "",
          duration_s: 2,
          clip_asset_id: clip,
          meta: {},
        }));
      if (table === "marketing_assets" && query.startsWith("id=in."))
        return ["c1", "c2"].map((id) => ({
          id,
          type: "clip",
          url: clipPath(id),
          meta: { provider: "kling" },
        }));
      return [];
    },
    async download(bucket, path) {
      downloads.push({ bucket, path });
      return new Uint8Array(await readFile(join(dir, path.split("/").pop())));
    },
    async upload(_bucket, path, bytes) {
      stored.set(path, new Uint8Array(bytes));
    },
    async update() {},
    async insert() {},
  };
}

const saved = {};
beforeEach(() => {
  for (const name of ["SUPABASE_URL", "REMOTION_DISABLE"])
    saved[name] = process.env[name];
  process.env.SUPABASE_URL = PROJECT;
  process.env.REMOTION_DISABLE = "1";
});
afterEach(() => {
  for (const [name, value] of Object.entries(saved))
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
});

test.skipIf(!hasFfmpeg)(
  "an uploaded logo (a private entity-attachments link) closes the film on the end card",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "logo-render-"));
    try {
      for (const [name, colour] of [
        ["c1", "black"],
        ["c2", "black"],
      ])
        media([
          "-f",
          "lavfi",
          "-i",
          `color=c=${colour}:s=320x240:d=2`,
          "-pix_fmt",
          "yuv420p",
          join(dir, `${name}.mp4`),
        ]);
      media([
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=200x200",
        "-frames:v",
        "1",
        join(dir, "logo.png"),
      ]);
      const render = async (logoPath) => {
        const db = renderDb(dir, {
          logo_url: attachment(logoPath),
          cta_text: "הירשמו",
        });
        const done = await renderFilm({
          db,
          run: {
            id: "run-1",
            tenant_id: TENANT,
            item_id: ITEM,
            stage_id: "stage-1",
            input: { aspect: "9:16" },
            output: {},
          },
          log: () => {},
        });
        const film = join(dir, `film-${db.downloads.length}.mp4`);
        await writeFile(film, db.stored.get(done.output.path));
        return { db, film, done };
      };

      const own = await render(`${TENANT}/workshop/${ITEM}/logo.png`);
      expect(own.db.downloads).toContainEqual({
        bucket: "entity-attachments",
        path: `${TENANT}/workshop/${ITEM}/logo.png`,
      });
      // The end card after the 4 s of scenes: the red logo above the call to action.
      const [r, g, b] = colourAt(own.film, 5.2, 0.5, 0.34);
      expect(r).toBeGreaterThan(180);
      expect(g).toBeLessThan(80);
      expect(b).toBeLessThan(80);

      // Another tenant's file is never read: the film closes on the call to action alone.
      const foreign = await render(`${OTHER}/workshop/${ITEM}/logo.png`);
      expect(
        foreign.db.downloads.some((d) => d.bucket === "entity-attachments"),
      ).toBe(false);
      expect(colourAt(foreign.film, 5.2, 0.5, 0.34)[0]).toBeLessThan(120);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
