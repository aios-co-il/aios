import { describe, expect, it } from "vitest";
import {
  CARMEN_VOICES,
  ELEVENLABS_VOICES,
  isElevenLabsVoice,
  OPENAI_VOICES,
  toCarmenVoice,
} from "./carmenVoices";

describe("carmenVoices", () => {
  it("keeps known OpenAI and ElevenLabs voices", () => {
    expect(toCarmenVoice("marin")).toBe("marin");
    expect(toCarmenVoice("yael")).toBe("yael");
  });

  it("drops unknown or empty saved voices", () => {
    expect(toCarmenVoice("nova")).toBeNull();
    expect(toCarmenVoice(null)).toBeNull();
    expect(toCarmenVoice("")).toBeNull();
  });

  it("keeps every voice of the server's list, of both providers", () => {
    const pickerIds = [...ELEVENLABS_VOICES, ...OPENAI_VOICES].map(
      (voice) => voice.id,
    );

    expect(CARMEN_VOICES.map((voice) => voice.id)).toEqual(pickerIds);
    expect(pickerIds.map(toCarmenVoice)).toEqual(pickerIds);
  });

  it("tells ElevenLabs voices from OpenAI ones", () => {
    expect(isElevenLabsVoice("danit")).toBe(true);
    expect(isElevenLabsVoice("marin")).toBe(false);
    expect(isElevenLabsVoice(null)).toBe(false);
  });
});
