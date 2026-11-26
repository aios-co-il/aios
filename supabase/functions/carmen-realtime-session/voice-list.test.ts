import { assertEquals } from "jsr:@std/assert@1";
import { ELEVENLABS_VOICES } from "./elevenlabs-voices.ts";
import { OPENAI_VOICES, REALTIME_VOICES } from "./voice-choice.ts";
import { CARMEN_VOICES, voiceListReply } from "./voice-list.ts";

Deno.test("the list holds every ElevenLabs and OpenAI voice once", () => {
  const ids = CARMEN_VOICES.map((voice) => voice.id);

  assertEquals(ids, [
    ...ELEVENLABS_VOICES.map((voice) => voice.id),
    ...OPENAI_VOICES.map((voice) => voice.id),
  ]);
  assertEquals(new Set(ids).size, ids.length);
});

Deno.test("each voice carries its label and its provider", () => {
  assertEquals(CARMEN_VOICES[0], {
    id: ELEVENLABS_VOICES[0].id,
    label: ELEVENLABS_VOICES[0].label,
    provider: "elevenlabs",
  });
  assertEquals(CARMEN_VOICES.at(-1), {
    ...OPENAI_VOICES[OPENAI_VOICES.length - 1],
    provider: "openai",
  });
});

Deno.test(
  "an OpenAI voice in the list is one a Realtime session accepts",
  () => {
    const openAiIds = CARMEN_VOICES.filter(
      (voice) => voice.provider === "openai",
    ).map((voice) => voice.id);

    assertEquals(new Set(openAiIds), REALTIME_VOICES);
  },
);

Deno.test("a list request without a provider gets the whole list", () => {
  assertEquals(voiceListReply(undefined), { voices: CARMEN_VOICES });
});

Deno.test(
  "the ElevenLabs list request keeps the shape installed Android apps parse",
  () => {
    const reply = voiceListReply("elevenlabs");

    assertEquals(
      JSON.stringify(reply),
      JSON.stringify({
        voices: ELEVENLABS_VOICES.map((voice) => ({
          id: voice.id,
          label: voice.label,
        })),
      }),
    );
    assertEquals(
      reply.voices.map((voice) => Object.keys(voice)),
      ELEVENLABS_VOICES.map(() => ["id", "label"]),
    );
  },
);
