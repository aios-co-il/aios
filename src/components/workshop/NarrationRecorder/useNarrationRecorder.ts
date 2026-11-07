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
 * listen back, record again. The microphone is released as soon as a recording stops.
 */
export function useNarrationRecorder(maxSeconds: number) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<NarrationRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingType((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const next = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      const chunks: Array<Blob> = [];
      next.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = next.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        setRecording({ blob, url: URL.createObjectURL(blob), mimeType: type });
        setState("recorded");
      };
      recorder.current = next;
      next.start();
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
      setError("אין גישה למיקרופון. אשרו גישה בדפדפן ונסו שוב.");
    }
  }, [maxSeconds, stop]);

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

  // Closing the recorder mid-recording releases the microphone.
  useEffect(() => stop, [stop]);

  return { state, seconds, recording, error, start, stop, reset };
}
