import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMedia } from "./fakeMedia";
import { useNarrationRecorder } from "./useNarrationRecorder";

let media: ReturnType<typeof fakeMedia>;
const createObjectURL = vi.fn(() => "blob:take");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  media = fakeMedia();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => vi.unstubAllGlobals());

/** Starts a recording and lets the browser grant the microphone. */
async function startRecording(result: {
  current: ReturnType<typeof useNarrationRecorder>;
}) {
  let started: Promise<void> = Promise.resolve();
  act(() => {
    started = result.current.start();
  });
  await act(async () => {
    media.grant();
    await started;
  });
}

describe("useNarrationRecorder", () => {
  test("records, stops and releases the microphone", async () => {
    const { result } = renderHook(() => useNarrationRecorder(180));
    await startRecording(result);
    expect(result.current.state).toBe("recording");
    act(() => result.current.stop());
    expect(result.current.state).toBe("recorded");
    expect(result.current.recording?.mimeType).toBe("audio/mp4");
    expect(media.tracks[0].stop).toHaveBeenCalled();
  });

  test("a second tap while the microphone is asked for starts nothing more", async () => {
    const { result } = renderHook(() => useNarrationRecorder(180));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.start();
      void result.current.start();
    });
    await act(async () => {
      media.grant();
      await first;
    });
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(media.recorders).toHaveLength(1);
  });

  test("closing while the browser asks for the microphone releases it once granted", async () => {
    const { result, unmount } = renderHook(() => useNarrationRecorder(180));
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });
    unmount();
    await act(async () => {
      media.grant();
      await started;
    });
    expect(media.tracks[0].stop).toHaveBeenCalled();
    expect(media.recorders).toHaveLength(0);
  });

  test("a recorder that cannot start releases the granted microphone", async () => {
    media.failRecorder = true;
    const { result } = renderHook(() => useNarrationRecorder(180));
    await startRecording(result);
    expect(media.tracks[0].stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toContain("מיקרופון");
  });

  test("closing mid-recording releases the microphone and makes no recording", async () => {
    const { result, unmount } = renderHook(() => useNarrationRecorder(180));
    await startRecording(result);
    unmount();
    expect(media.tracks[0].stop).toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
