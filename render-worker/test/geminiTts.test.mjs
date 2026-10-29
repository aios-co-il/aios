import { expect, test } from "vitest";
import { isPaidPlanError } from "../src/providers/plan.mjs";
import {
  geminiSpeechBody,
  geminiSpeechCost,
  speechFile,
  synthesizeGeminiSpeech,
} from "../src/providers/geminiTts.mjs";

test("a starter-plan refusal is recognized", () => {
  expect(
    isPaidPlanError(new Error("elevenlabs speech 402: paid_plan_required")),
  ).toBe(true);
  expect(isPaidPlanError(new Error("ממשק התמונות דורש תוכנית Pro"))).toBe(true);
  expect(isPaidPlanError(new Error("higgsfield submit 500"))).toBe(false);
});

test("the request names a prebuilt voice and sends only the transcript", () => {
  const body = geminiSpeechBody("שלום");
  expect(body.contents[0].parts).toStrictEqual([{ text: "שלום" }]);
  expect(body.generationConfig.responseModalities[0]).toBe("AUDIO");
  expect(body.generationConfig.speechConfig).toStrictEqual({
    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
  });
  expect(body.model).toBe("gemini-3.8-flash-tts");
});

test("raw PCM from Gemini is wrapped as a WAV at the rate it states", async () => {
  const pcm = Buffer.alloc(48000);
  const speech = await synthesizeGeminiSpeech({
    apiKey: "g",
    text: "שלום",
    fetchImpl: async (_url, init) => {
      expect(init.headers["x-goog-api-key"]).toBe("g");
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
  expect(speech.contentType).toBe("audio/wav");
  expect(speech.bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(speech.bytes.readUInt32LE(24)).toBe(24000);
  expect(speech.bytes.length).toBe(44 + pcm.length);
  expect(speech.voice).toBe("Kore");
  expect(speech.costUsd).toBe(0.0003);
});

test("a ready WAV is kept, and cost falls back to the audio length", () => {
  const wav = Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE"), Buffer.alloc(8)]);
  const kept = speechFile(wav, "audio/wav");
  expect(kept.bytes).toBe(wav);
  const pcm = speechFile(Buffer.alloc(48000), "audio/L16;rate=24000");
  expect(pcm.seconds).toBe(1);
  expect(geminiSpeechCost(null, { text: "abcd", seconds: 1 })).toBe(0.0003);
});
