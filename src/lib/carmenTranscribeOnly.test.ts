import { expect, test } from "vitest";
import {
  isMicCaptureMode,
  loadMicCaptureMode,
  logTranscribeOnlyEvent,
  MIC_CAPTURE_MODE_KEY,
  shouldAllowTtsResponse,
} from "./carmenTranscribeOnly.ts";

test("transcribe_only blocks TTS responses", () => {
  expect(shouldAllowTtsResponse("transcribe_only")).toBe(false);
  expect(shouldAllowTtsResponse("typed")).toBe(true);
  expect(shouldAllowTtsResponse("realtime_voice")).toBe(true);
});

test("mic capture mode validates known values", () => {
  expect(isMicCaptureMode("transcribe_only")).toBe(true);
  expect(isMicCaptureMode("realtime_voice")).toBe(true);
  expect(isMicCaptureMode("typed")).toBe(false);
});

test("loadMicCaptureMode defaults to realtime_voice", () => {
  if (typeof globalThis.localStorage === "undefined") return;
  const prev = globalThis.localStorage.getItem(MIC_CAPTURE_MODE_KEY);
  try {
    globalThis.localStorage.setItem(MIC_CAPTURE_MODE_KEY, "transcribe_only");
    expect(loadMicCaptureMode()).toBe("transcribe_only");
    globalThis.localStorage.removeItem(MIC_CAPTURE_MODE_KEY);
    expect(loadMicCaptureMode()).toBe("realtime_voice");
  } finally {
    if (prev == null) globalThis.localStorage.removeItem(MIC_CAPTURE_MODE_KEY);
    else globalThis.localStorage.setItem(MIC_CAPTURE_MODE_KEY, prev);
  }
});

test("logTranscribeOnlyEvent prefixes structured pipeline steps", () => {
  const lines: unknown[][] = [];
  const orig = console.info;
  console.info = (...args: unknown[]) => lines.push(args);
  try {
    logTranscribeOnlyEvent("send_text", { chars: 12 });
    expect(lines.length).toBe(1);
    expect(lines[0][0]).toBe("[carmen:transcribe_only]");
    expect(lines[0][1]).toStrictEqual({ step: "send_text", chars: 12 });
  } finally {
    console.info = orig;
  }
});
