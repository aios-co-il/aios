import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_VOICE_STORAGE_KEY,
  clearLegacyVoice,
  readLegacyVoice,
} from "./legacyVoiceAdoption";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Any storage call in a browser that blocks site data. */
function refuse(): never {
  throw new Error("storage is blocked");
}

describe("the old voice key", () => {
  it("is read and removed under its old name", () => {
    localStorage.setItem("aios:carmen-voice", "marin");

    expect(LEGACY_VOICE_STORAGE_KEY).toBe("aios:carmen-voice");
    expect(readLegacyVoice()).toBe("marin");

    clearLegacyVoice();

    expect(readLegacyVoice()).toBeNull();
  });

  it("reads as absent and logs a failed removal when storage is blocked", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("localStorage", { getItem: refuse, removeItem: refuse });

    expect(readLegacyVoice()).toBeNull();

    clearLegacyVoice();

    expect(warn).toHaveBeenCalledOnce();
  });
});
