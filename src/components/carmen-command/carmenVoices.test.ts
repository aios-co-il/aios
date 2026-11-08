import { describe, expect, it } from "vitest";
import { isElevenLabsVoice, toCarmenVoice } from "./carmenVoices";

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

  it("tells ElevenLabs voices from OpenAI ones", () => {
    expect(isElevenLabsVoice("danit")).toBe(true);
    expect(isElevenLabsVoice("marin")).toBe(false);
    expect(isElevenLabsVoice(null)).toBe(false);
  });
});
