import { assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { ToolContext } from "../tool-context.ts";
import { quoteProduction } from "./produce-video-quote.ts";
import { fakeDb, scene } from "./test-fakes.ts";

const VOICE = "d4eLZ8u5dfBCsjp4YPyz";

/** A context whose narration is ready or not, with a music bed or none. */
function ctx(
  ready: boolean,
  bed: boolean,
  args: Record<string, unknown> = {},
): ToolContext {
  return {
    supabase: fakeDb({
      "rpc:video_narration_ready": ready,
      "marketing_assets:select": bed
        ? [{ id: "m-1", type: "music", url: "music.mp3" }]
        : [],
    }),
    tenantId: "tenant-1",
    name: "workshop_produce_video",
    args,
    assertClientAccess: async () => {},
    userId: null,
    deps: {},
  };
}

/** Lines long enough that their narration costs at least a cent. */
const LINE = "כרמן מנהלת את השיווק של העסק שלכם ".repeat(4);
const scenes = [
  scene("s-1", { voiceover_text: LINE }),
  scene("s-2", { voiceover_text: LINE }),
];
const order = {
  itemId: "item-1",
  payload: { project_type: "video" },
  video: { voice_id: VOICE },
  scenes,
  engine: "mock" as const,
  animated: scenes,
  relip: [],
};

describe("quoteProduction", () => {
  it("prices no narration or bed the film already has", async () => {
    const quote = await quoteProduction(ctx(true, true), order);
    assertStrictEquals(quote.withVoice, true);
    assertStrictEquals(quote.newVoice, false);
    assertStrictEquals(quote.voiceId, VOICE);
    assertStrictEquals(quote.estimate.voice.usd, 0);
    assertStrictEquals(quote.estimate.music.usd, 0);
    assertStrictEquals(quote.units, 2);
  });

  it("prices a new narration for a new voice and a bed when there is none", async () => {
    const quote = await quoteProduction(
      ctx(true, false, { voice_id: "p7J75VowGmxi3K0it9lN" }),
      order,
    );
    assertStrictEquals(quote.newVoice, true);
    assertStrictEquals(quote.estimate.voice.usd > 0, true);
    assertStrictEquals(quote.estimate.music.usd > 0, true);
  });

  it("leaves the music out when the call asks for none", async () => {
    const quote = await quoteProduction(
      ctx(false, false, { music: false }),
      order,
    );
    assertStrictEquals(quote.withMusic, false);
    assertStrictEquals(quote.estimate.music.usd, 0);
  });
});
