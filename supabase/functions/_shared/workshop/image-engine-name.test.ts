import { assertStrictEquals } from "jsr:@std/assert@1";

Deno.test(
  "engine names from the user or the model resolve to an engine id",
  async () => {
    const { normalizeEngine } = await import("./image-engine-name.ts");
    assertStrictEquals(normalizeEngine("elevenlabs"), "elevenlabs");
    assertStrictEquals(normalizeEngine("ElevenLabs"), "elevenlabs");
    assertStrictEquals(normalizeEngine("eleven_labs"), "elevenlabs");
    assertStrictEquals(normalizeEngine("אילוון לאבז"), "elevenlabs");
    assertStrictEquals(normalizeEngine("Nano Banana Pro"), "google");
    assertStrictEquals(normalizeEngine("גוגל"), "google");
    assertStrictEquals(normalizeEngine("higgsfield"), "higgsfield");
    assertStrictEquals(normalizeEngine("GPT image"), "openai");
    assertStrictEquals(normalizeEngine("midjourney"), null);
    assertStrictEquals(normalizeEngine(""), null);
    assertStrictEquals(normalizeEngine(undefined), null);
  },
);
