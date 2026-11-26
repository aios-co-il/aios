import { assertEquals } from "jsr:@std/assert@1";
import {
  chooseElevenLabsVoice,
  ELEVENLABS_VOICES,
} from "./elevenlabs-voices.ts";

Deno.test("the user's pick wins over Carmen's configured voice", () => {
  assertEquals(chooseElevenLabsVoice("zina", "danit").id, "zina");
});

Deno.test(
  "without a pick, Carmen speaks her configured ElevenLabs voice",
  () => {
    assertEquals(chooseElevenLabsVoice(undefined, "danit").id, "danit");
  },
);

Deno.test(
  "an unknown pick or an OpenAI voice falls back to the first voice",
  () => {
    assertEquals(
      chooseElevenLabsVoice("robot", "shimmer"),
      ELEVENLABS_VOICES[0],
    );
    assertEquals(chooseElevenLabsVoice(undefined, null), ELEVENLABS_VOICES[0]);
  },
);
