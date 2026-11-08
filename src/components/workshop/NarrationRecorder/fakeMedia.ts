import { vi } from "vitest";

/**
 * A browser microphone and MediaRecorder for the recorder's tests: getUserMedia answers when the
 * test grants it, each track records whether it was stopped, and the recorder hands back one chunk
 * when it stops.
 */
export function fakeMedia() {
  const tracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
  const grants: Array<() => void> = [];
  const recorders: Array<FakeRecorder> = [];
  const media = {
    tracks,
    recorders,
    /** Throw from the MediaRecorder constructor. */
    failRecorder: false,
    getUserMedia: vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grants.push(() => {
            const track = { stop: vi.fn() };
            tracks.push(track);
            resolve({ getTracks: () => [track] } as unknown as MediaStream);
          });
        }),
    ),
    /** Answers the oldest pending microphone request. */
    grant: () => grants.shift()?.(),
  };

  class FakeRecorder {
    static isTypeSupported = (type: string) => type === "audio/mp4";
    state = "inactive";
    mimeType: string;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_stream: MediaStream, options: { mimeType?: string } = {}) {
      if (media.failRecorder) {
        throw new Error("NotSupportedError");
      }
      this.mimeType = options.mimeType ?? "";
      recorders.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["voice"], { type: "audio/mp4" }),
      });
      this.onstop?.();
    }
  }

  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: media.getUserMedia },
  });
  return media;
}
