import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingType } from "./recording";

export type RecorderState = "idle" | "recording" | "recorded";

export interface NarrationRecording {
  blob: Blob;
  /** An object URL to listen back with; revoked when it is replaced or the recorder closes. */
  url: string;
  mimeType: string;
}

/**
 * The microphone recorder behind "הקלטה בקול שלי": record, stop (by hand or at `maxSeconds`),
 * listen back, record again. The microphone is released as soon as a recording stops, when the
 * recorder closes (also while the browser still asks for the microphone), and when starting fails
 * after it was granted.
 */
export function useNarrationRecorder(maxSeconds: number) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<NarrationRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  // The recorder is open, and a start is waiting for the microphone (a second tap does nothing).
  const alive = useRef(true);
  const starting = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    if (recorder.current?.state === "recording") {
      // onstop releases the microphone once the last chunk is in.
      recorder.current.stop();
    } else {
      releaseStream();
    }
  }, [clearTimer, releaseStream]);

  const start = useCallback(async () => {
    if (starting.current || recorder.current?.state === "recording") {
      return;
    }
    starting.current = true;
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const next = recorderFor(media, () => {
        releaseStream();
        return alive.current;
      });
      next.onfinish = (made) => {
        setRecording(made);
        setState("recorded");
      };
      recorder.current = next.recorder;
      next.recorder.start();
      const startedAt = Date.now();
      setSeconds(0);
      setState("recording");
      timer.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        setSeconds(elapsed);
        if (elapsed >= maxSeconds) {
          stop();
        }
      }, 250);
    } catch (cause) {
      console.error("[workshop] narration recording did not start", cause);
      clearTimer();
      releaseStream();
      recorder.current = null;
      if (alive.current) {
        setError("אין גישה למיקרופון. אשרו גישה בדפדפן ונסו שוב.");
      }
    } finally {
      starting.current = false;
    }
  }, [clearTimer, maxSeconds, releaseStream, stop]);

  const reset = useCallback(() => {
    stop();
    setRecording(null);
    setSeconds(0);
    setState("idle");
  }, [stop]);

  // A replaced or closed recording frees its object URL.
  useEffect(
    () => () => {
      if (recording) {
        URL.revokeObjectURL(recording.url);
      }
    },
    [recording],
  );

  // Closing the recorder stops a recording and releases the microphone.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);

  return { state, seconds, recording, error, start, stop, reset };
}

/**
 * A MediaRecorder on `media` in the first format the browser records. When it stops, `stopped`
 * releases the microphone and says whether the recorder is still open; only then is the recording
 * made (an object URL made after closing would never be revoked) and handed to `onfinish`.
 */
function recorderFor(media: MediaStream, stopped: () => boolean) {
  const mimeType = pickRecordingType((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  const recorder = new MediaRecorder(media, mimeType ? { mimeType } : {});
  const chunks: Array<Blob> = [];
  const made: {
    recorder: MediaRecorder;
    onfinish: (r: NarrationRecording) => void;
  } = {
    recorder,
    onfinish: () => {},
  };
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };
  recorder.onstop = () => {
    if (!stopped()) {
      return;
    }
    const type = recorder.mimeType || mimeType || "audio/webm";
    const blob = new Blob(chunks, { type });
    made.onfinish({ blob, url: URL.createObjectURL(blob), mimeType: type });
  };
  return made;
}
