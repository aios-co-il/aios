import { expect, test } from "vitest";
import { recordingsPollInterval } from "./recordingsPollInterval.ts";

test("recordingsPollInterval ignores non-array cache data", () => {
  expect(recordingsPollInterval(undefined)).toBe(false);
  expect(recordingsPollInterval({})).toBe(false);
});

test("recordingsPollInterval polls while any row is processing", () => {
  expect(
    recordingsPollInterval([
      { transcription_status: "completed" },
      { transcription_status: "processing" },
    ]),
  ).toBe(8000);
  expect(recordingsPollInterval([{ transcription_status: "completed" }])).toBe(
    false,
  );
});
