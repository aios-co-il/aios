import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_VOICE_STORAGE_KEY } from "./legacyVoiceAdoption";
import { useCarmenVoicePick } from "./useCarmenVoicePick";

const state = vi.hoisted(() => ({
  voice: null as string | null,
  answered: true,
  saveVoice:
    vi.fn<(voice: string, options: { onSuccess: () => void }) => void>(),
}));

vi.mock("./useCarmenChoices", () => ({
  useCarmenChoices: () => ({
    voice: state.voice,
    answered: state.answered,
    saveVoice: state.saveVoice,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  state.voice = null;
  state.answered = true;
  state.saveVoice.mockClear();
});

describe("useCarmenVoicePick", () => {
  it("reads the stored voice, and an id this app does not know as no pick", () => {
    state.voice = "cedar";
    const known = renderHook(() => useCarmenVoicePick("tenant-a"));
    state.voice = "openai";
    const unknown = renderHook(() => useCarmenVoicePick("tenant-a"));

    expect(known.result.current.voice).toBe("cedar");
    expect(unknown.result.current.voice).toBeNull();
  });

  it.each(["marin", "yael"])(
    "moves the device's old voice %s to the row once, and removes the old key when it is stored",
    (oldVoice) => {
      localStorage.setItem(LEGACY_VOICE_STORAGE_KEY, oldVoice);

      const { rerender } = renderHook(() => useCarmenVoicePick("tenant-a"));
      // The pick shows at once, before the row confirms it.
      state.voice = oldVoice;
      rerender();

      expect(state.saveVoice).toHaveBeenCalledOnce();
      expect(state.saveVoice.mock.calls[0][0]).toBe(oldVoice);
      expect(localStorage.getItem(LEGACY_VOICE_STORAGE_KEY)).toBe(oldVoice);

      state.saveVoice.mock.calls[0][1].onSuccess();

      expect(localStorage.getItem(LEGACY_VOICE_STORAGE_KEY)).toBeNull();
    },
  );

  it("keeps the row's voice and removes the old key", () => {
    localStorage.setItem(LEGACY_VOICE_STORAGE_KEY, "marin");
    state.voice = "cedar";

    renderHook(() => useCarmenVoicePick("tenant-a"));

    expect(state.saveVoice).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_VOICE_STORAGE_KEY)).toBeNull();
  });

  it("leaves the old key alone until the server reported the row", () => {
    localStorage.setItem(LEGACY_VOICE_STORAGE_KEY, "marin");
    state.answered = false;

    const { rerender } = renderHook(() => useCarmenVoicePick("tenant-a"));

    expect(state.saveVoice).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_VOICE_STORAGE_KEY)).toBe("marin");

    state.answered = true;
    rerender();

    expect(state.saveVoice).toHaveBeenCalledOnce();
  });

  it("removes an old value that is not a known voice and saves nothing", () => {
    localStorage.setItem(LEGACY_VOICE_STORAGE_KEY, "nova");

    const { result } = renderHook(() => useCarmenVoicePick("tenant-a"));

    expect(state.saveVoice).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_VOICE_STORAGE_KEY)).toBeNull();
    expect(result.current.voice).toBeNull();
  });

  it("saves nothing on a device without the old key", () => {
    renderHook(() => useCarmenVoicePick("tenant-a"));

    expect(state.saveVoice).not.toHaveBeenCalled();
  });

  it("speaks the device's old voice until the server answers, unless the picks already hold one", () => {
    localStorage.setItem(LEGACY_VOICE_STORAGE_KEY, "marin");
    state.answered = false;

    const waiting = renderHook(() => useCarmenVoicePick("tenant-a"));
    state.voice = "cedar";
    const cached = renderHook(() => useCarmenVoicePick("tenant-a"));

    expect(waiting.result.current.voice).toBe("marin");
    expect(cached.result.current.voice).toBe("cedar");
  });

  it("speaks Carmen's own voice once the server answered that the user picked none", () => {
    localStorage.setItem(LEGACY_VOICE_STORAGE_KEY, "marin");

    const { result } = renderHook(() => useCarmenVoicePick("tenant-a"));

    // The adoption is on its way; until it shows, the row's answer stands.
    expect(result.current.voice).toBeNull();
  });
});
