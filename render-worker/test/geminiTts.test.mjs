import assert from "node:assert/strict";
import test from "node:test";
import { isPaidPlanError } from "../src/providers/plan.mjs";
import {
  geminiSpeechBody,
  geminiSpeechCost,
  speechFile,
  synthesizeGeminiSpeech,
} from "../src/providers/geminiTts.mjs";

test("a starter-plan refusal is recognized", () => {
  assert.equal(
    isPaidPlanError(new Error("elevenlabs speech 402: paid_plan_required")),
    true,
  );
  assert.equal(
    isPaidPlanError(new Error("ממשק התמונות דורש תוכנית Pro")),
    true,
  );
  assert.equal(isPaidPlanError(new Error("higgsfield submit 500")), false);
});

test("the request names a prebuilt voice and sends only the transcript", () => {
  const body = geminiSpeechBody("שלום");
  assert.deepEqual(body.contents[0].parts, [{ text: "שלום" }]);
  assert.equal(body.generationConfig.responseModalities[0], "AUDIO");
  assert.deepEqual(body.generationConfig.speechConfig, {
    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
  });
  assert.equal(body.model, "gemini-3.8-flash-tts");
});

test("raw PCM from Gemini is wrapped as a WAV at the rate it states", async () => {
  const pcm = Buffer.alloc(48000);
  const speech = await synthesizeGeminiSpeech({
    apiKey: "g",
    text: "שלום",
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers["x-goog-api-key"], "g");
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "audio/L16;codec=pcm;rate=24000",
                      data: pcm.toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 25 },
        }),
      };
    },
  });
  assert.equal(speech.contentType, "audio/wav");
  assert.equal(speech.bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(speech.bytes.readUInt32LE(24), 24000);
  assert.equal(speech.bytes.length, 44 + pcm.length);
  assert.equal(speech.voice, "Kore");
  assert.equal(speech.costUsd, 0.0003);
});

test("a ready WAV is kept, and cost falls back to the audio length", () => {
  const wav = Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE"), Buffer.alloc(8)]);
  const kept = speechFile(wav, "audio/wav");
  assert.equal(kept.bytes, wav);
  const pcm = speechFile(Buffer.alloc(48000), "audio/L16;rate=24000");
  assert.equal(pcm.seconds, 1);
  assert.equal(geminiSpeechCost(null, { text: "abcd", seconds: 1 }), 0.0003);
});
