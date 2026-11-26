import { existsSync } from "node:fs";
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

describe("meetingBotPicture", () => {
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
