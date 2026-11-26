import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { MINI_ME_GENDERS } from "../supabase/functions/_shared/carmen/minime-gender.ts";
import {
  MEETING_BOT_PICTURE_SIZE,
  meetingBotPicturePath,
} from "../supabase/functions/_shared/meeting-bot/bot-picture.ts";
import { RECALL_JPEG_B64_MAX_LENGTH } from "../supabase/functions/_shared/recall.ts";
import viteConfig from "../vite.config.ts";
import {
  meetingBotPicture,
  meetingBotRenderFile,
  renderMeetingBotPicture,
} from "./meetingBotPicture.ts";

interface EmittedAsset {
  fileName: string;
  source: Buffer;
}

/** Runs the plugin's bundle step over the repo's renders and returns what it emits. */
async function emittedPictures(): Promise<Array<EmittedAsset>> {
  const emitted: Array<EmittedAsset> = [];
  const { generateBundle } = meetingBotPicture();
  if (typeof generateBundle !== "function") {
    throw new Error("the plugin has no bundle step");
  }

  await Reflect.apply(
    generateBundle,
    { emitFile: (asset: EmittedAsset) => emitted.push(asset) },
    [],
  );
  return emitted;
}

const RED = { r: 255, g: 0, b: 0 };
const { width: WIDTH, height: HEIGHT } = MEETING_BOT_PICTURE_SIZE;

/** The tile derived from a square, all-red render of `size` pixels. */
async function tileOfRedRender(size: number): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "meeting-bot-picture-"));
  const renderFile = path.join(dir, "render.webp");

  try {
    await sharp({
      create: { width: size, height: size, channels: 3, background: RED },
    })
      .webp({ lossless: true })
      .toFile(renderFile);
    return await renderMeetingBotPicture(renderFile);
  } finally {
    await rm(dir, { recursive: true });
  }
}

/** Whether the tile's pixel at `dx`, `dy` from its centre is the render's red, not the white behind. */
async function isFigureAt(tile: Buffer, dx: number, dy: number) {
  const { data } = await sharp(tile)
    .extract({
      left: WIDTH / 2 + dx,
      top: HEIGHT / 2 + dy,
      width: 1,
      height: 1,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[0] > 200 && data[1] < 60 && data[2] < 60;
}

describe("meetingBotPicture", () => {
  it("wears the copywriter skin", () => {
    expect(
      MINI_ME_GENDERS.map((gender) =>
        path.basename(meetingBotRenderFile(process.cwd(), gender)),
      ),
    ).toEqual(["copywriter-male.webp", "copywriter-female.webp"]);
  });

  it("keeps a small render at its own size instead of enlarging it", async () => {
    const tile = await tileOfRedRender(100);

    expect(await isFigureAt(tile, 0, 0)).toBe(true);
    expect(await isFigureAt(tile, -46, 0)).toBe(true);
    expect(await isFigureAt(tile, -56, 0)).toBe(false);
  });

  it("shrinks a large render to the figure's place on the tile", async () => {
    const tile = await tileOfRedRender(1000);

    expect(await isFigureAt(tile, -280, 0)).toBe(true);
    expect(await isFigureAt(tile, -296, 0)).toBe(false);
    expect(await isFigureAt(tile, 0, -280)).toBe(true);
  });

  it("cuts the figure to its circle, as the site shows it", async () => {
    const tile = await tileOfRedRender(100);

    // Inside the render's square, outside its circle.
    expect(await isFigureAt(tile, -44, -44)).toBe(false);
    expect(await isFigureAt(tile, 44, 44)).toBe(false);
  });

  it("has a source render for each Mini Me set", () => {
    for (const gender of MINI_ME_GENDERS) {
      expect(existsSync(meetingBotRenderFile(process.cwd(), gender))).toBe(
        true,
      );
    }
  });

  it("derives a picture Recall accepts from each render", async () => {
    for (const gender of MINI_ME_GENDERS) {
      const picture = await renderMeetingBotPicture(
        meetingBotRenderFile(process.cwd(), gender),
      );
      const { format, width, height } = await sharp(picture).metadata();

      expect({ format, width, height }).toEqual({
        format: "jpeg",
        ...MEETING_BOT_PICTURE_SIZE,
      });
      expect(picture.toString("base64").length).toBeLessThanOrEqual(
        RECALL_JPEG_B64_MAX_LENGTH,
      );
    }
  });

  it("serves each set's picture at the address the edge function reads", async () => {
    const emitted = await emittedPictures();

    expect(emitted.map((asset) => `/${asset.fileName}`)).toEqual(
      MINI_ME_GENDERS.map(meetingBotPicturePath),
    );
    expect(emitted.every((asset) => asset.source.length > 0)).toBe(true);
  });

  it("fails when a render is missing", async () => {
    await expect(
      renderMeetingBotPicture(
        meetingBotRenderFile("/no-such-checkout", "male"),
      ),
    ).rejects.toThrow("ENOENT");
  });

  it("runs in the site's build", async () => {
    const config = await viteConfig({
      mode: "production",
      command: "build",
    });
    const plugins = (config.plugins ?? []).flat() as Array<Plugin>;

    expect(plugins.map((plugin) => plugin.name)).toContain(
      "meeting-bot-picture",
    );
  });
});
