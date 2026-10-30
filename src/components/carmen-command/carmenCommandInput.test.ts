import { expect, test } from "vitest";
import {
  deliveryForInputMode,
  onRealtimeUnavailable,
  shouldResumeLegacyListen,
  shouldSpeakWithLegacyTts,
  tagChatTurn,
  shouldLogRealtimeTranscript,
  volumeControlsLiveSession,
} from "./carmenCommandInput.ts";

test("typed, transcribe-only, and callback turns are text-only", () => {
  expect(deliveryForInputMode("typed")).toBe("text");
  expect(deliveryForInputMode("transcribe_only")).toBe("text");
  expect(deliveryForInputMode("external_channel_callback")).toBe("text");
  expect(deliveryForInputMode("realtime_voice")).toBe("realtime");
});

test("typed replies never go through carmen-speak", () => {
  expect(shouldSpeakWithLegacyTts("typed")).toBe(false);
  expect(shouldSpeakWithLegacyTts("transcribe_only")).toBe(false);
  expect(shouldSpeakWithLegacyTts("realtime_voice")).toBe(false);
  expect(shouldSpeakWithLegacyTts("external_channel_callback")).toBe(false);
});

test("volume toggle is Live-only", () => {
  expect(volumeControlsLiveSession("typed")).toBe(false);
  expect(volumeControlsLiveSession("transcribe_only")).toBe(false);
  expect(volumeControlsLiveSession("realtime_voice")).toBe(true);
  expect(volumeControlsLiveSession("external_channel_callback")).toBe(false);
});

test("Realtime failure must not fall back to transcribe-voice", () => {
  const result = onRealtimeUnavailable();
  expect(result.fallbackToLegacyListen).toBe(false);
  expect(result.description).toMatch(/Realtime/);
});

test("typed send never reopens the legacy listen loop", () => {
  expect(
    shouldResumeLegacyListen({ inputMode: "typed", realtimeActive: false }),
  ).toBe(false);
  expect(
    shouldResumeLegacyListen({
      inputMode: "realtime_voice",
      realtimeActive: false,
    }),
  ).toBe(false);
});

test("live voice does not dump transcription into the typed thread", () => {
  expect(shouldLogRealtimeTranscript()).toBe(false);
});

test("chat turns are tagged with input and delivery mode", () => {
  expect(tagChatTurn("typed")).toStrictEqual({
    input_mode: "typed",
    delivery_mode: "text",
  });
  expect(tagChatTurn("transcribe_only")).toStrictEqual({
    input_mode: "transcribe_only",
    delivery_mode: "text",
  });
  expect(tagChatTurn("realtime_voice")).toStrictEqual({
    input_mode: "realtime_voice",
    delivery_mode: "realtime",
  });
});
