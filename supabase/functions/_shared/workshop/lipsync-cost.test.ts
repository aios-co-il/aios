import { assert, assertEquals } from "jsr:@std/assert@1";
import { relipEstimate } from "./lipsync-cost.ts";
import { quotedProductionEstimate } from "./video-cost.ts";

Deno.test(
  "a kept talking scene with a new line is quoted as its lip sync alone",
  () => {
    const relip = [
      {
        duration_s: 4,
        voiceover_text: "",
        lipsync: true,
        dialogue: "אני הקמפיינרית שלך",
        chosen_voice: true,
      },
    ];
    const again = relipEstimate(relip);
    // 4 s of lip sync at $0.10 plus the voice line.
    assert(again.usd >= 0.4 && again.usd < 0.5, String(again.usd));
    // A line in the chosen voice never goes to Veo, so OpenRouter does not change its price.
    assertEquals(relipEstimate(relip, { openrouter: true }), again);
    // Not a chosen voice: the worker's chain may end at Veo, so the dearer one is quoted.
    const engineVoice = [{ ...relip[0], chosen_voice: false }];
    assertEquals(relipEstimate(engineVoice, { openrouter: true }).usd, 1.6);
    const quote = quotedProductionEstimate(
      "elevenlabs",
      [],
      { withVoice: false, withMusic: false },
      {},
      relip,
    );
    assertEquals(quote.totalUsd, again.usd);
    assertEquals(quote.lipsync.usd, again.usd);
    assertEquals(quote.talkingScenes, 1);
    // Nothing kept to redo: the quote is unchanged.
    assertEquals(
      quotedProductionEstimate("elevenlabs", [], {
        withVoice: false,
        withMusic: false,
      }).totalUsd,
      0,
    );
  },
);
