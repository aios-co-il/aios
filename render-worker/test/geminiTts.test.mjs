import assert from "node:assert/strict";
import test from "node:test";
import { isPaidPlanError } from "../src/providers/plan.mjs";
import {
  geminiSpeechBody,
  synthesizeGeminiSpeech,
} from "../src/providers/geminiTts.mjs";

test("a starter-plan refusal is recognized", () => {
  assert.equal(isPaidPlanError(new Error("elevenlabs speech 402: paid_plan_required")), true);
  assert.equal(isPaidPlanError(new Error("ממשק התמונות דורש תוכנית Pro")), true);
  assert.equal(isPaidPlanError(new Error("higgsfield submit 500")), false);
});

test("Gemini TTS speaks the transcript and returns the wav bytes", async () => {
  const body = geminiSpeechBody("שלום");
  assert.equal(body.contents[0].parts[0].text, "שלום");
  assert.equal(body.generationConfig.responseModalities[0], "AUDIO");
  assert.equal(body.model, "gemini-3.8-flash-tts");
  const wav = Buffer.from("RIFFwav");
  const speech = await synthesizeGeminiSpeech({
    apiKey: "g",
    text: "שלום",
    fetchImpl: async (_url, init) => {
      const sent = JSON.parse(init.body);
      assert.equal(sent.contents[0].parts[0].text, "שלום");
      assert.equal(init.headers["x-goog-api-key"], "g");
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: wav.toString("base64") } }],
              },
            },
          ],
        }),
      };
    },
  });
  assert.equal(speech.model, "gemini-3.8-flash-tts");
  assert.equal(speech.contentType, "audio/wav");
  assert.equal(speech.bytes.toString(), "RIFFwav");
});
