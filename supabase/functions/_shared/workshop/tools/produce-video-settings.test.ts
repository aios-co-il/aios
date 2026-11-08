import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  productionOptions,
  productionVideo,
} from "./produce-video-settings.ts";
import { quoteProduction } from "./produce-video-quote.ts";
import { fakeDb, scene } from "./test-fakes.ts";

const choices = {
  engine: "kling" as const,
  soundDesign: true,
  keepDesign: false,
  voiceId: "voice-1",
};

describe("productionVideo", () => {
  it("keeps the gated video and adds the choices and known look settings", () => {
    const video = productionVideo(
      { video: { approved_stills: ["a"] } },
      { font: "rubik", title_style: "no-such-style", end_card_glass: false },
      choices,
    );
    assertEquals(video.approved_stills, ["a"]);
    assertStrictEquals(video.scene_engine, "kling");
    assertStrictEquals(video.sound_engine, "elevenlabs");
    assertStrictEquals(video.voice_id, "voice-1");
    assertStrictEquals(video.font, "rubik");
    assertStrictEquals(video.end_card_glass, false);
    assertStrictEquals("title_style" in video, false);
  });

  it("leaves the voice out when none was chosen", () => {
    const video = productionVideo({}, {}, { ...choices, voiceId: null });
    assertStrictEquals("voice_id" in video, false);
  });
});

describe("productionOptions", () => {
  it("passes the quote's parts, the sound and the stage to produce_video", async () => {
    const scenes = [scene("s-1")];
    const quote = await quoteProduction(
      {
        supabase: fakeDb({ "marketing_assets:select": [] }),
        tenantId: "tenant-1",
        name: "workshop_produce_video",
        args: { music: false },
        assertClientAccess: async () => {},
        userId: null,
        deps: {},
      },
      {
        itemId: "item-1",
        payload: {},
        video: { voice_id: "d4eLZ8u5dfBCsjp4YPyz" },
        scenes,
        engine: "kling",
        animated: scenes,
        relip: [],
      },
    );
    const options = productionOptions(
      "9:16",
      "kling",
      "stage-1",
      quote,
      "jazz",
    );
    assertStrictEquals(options.provider, "kling");
    assertStrictEquals(options.stage_id, "stage-1");
    assertStrictEquals(options.with_voice, true);
    assertStrictEquals(options.with_music, false);
    assertStrictEquals(options.voice_id, "d4eLZ8u5dfBCsjp4YPyz");
    assertStrictEquals(options.music_prompt, "jazz");
    assertEquals(options.estimate.clips, quote.estimate.clips);
  });
});
