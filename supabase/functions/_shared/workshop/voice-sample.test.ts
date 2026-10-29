import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { sampleSpeech } from "./voice-sample.ts";
import { HEBREW_VOICES } from "./voices.ts";

const yael = HEBREW_VOICES[0];

Deno.test(
  "a rejected ElevenLabs key makes the sample through OpenRouter in the same voice",
  async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push(url);
      if (url.includes("elevenlabs.io"))
        return new Response("invalid_api_key", { status: 401 });
      const body = JSON.parse(String(init.body));
      assertStrictEquals(body.voice, yael.id);
      assertStrictEquals(body.response_format, "mp3");
      return new Response(new Uint8Array([7, 7]));
    }) as typeof fetch;
    const spoken = await sampleSpeech(
      yael,
      { elevenLabs: "bad", openRouter: () => Promise.resolve("sk-or") },
      fetchImpl,
    );
    assertEquals(spoken.bytes, new Uint8Array([7, 7]));
    assertEquals(calls.length, 2);
  },
);

Deno.test("with no key at all the sample reports why", async () => {
  const spoken = await sampleSpeech(
    yael,
    { elevenLabs: null, openRouter: () => Promise.resolve(null) },
    (() => {
      throw new Error("no fetch expected");
    }) as typeof fetch,
  );
  assertEquals(spoken, { error: "אין מפתח ElevenLabs" });
});
