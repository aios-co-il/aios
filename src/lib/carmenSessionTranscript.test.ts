import { describe, expect, it } from "vitest";
import {
  toSessionMessages,
  toTranscriptLines,
} from "./carmenSessionTranscript";

describe("toSessionMessages", () => {
  it("returns an empty list for non-array values", () => {
    expect(toSessionMessages(null)).toEqual([]);
    expect(toSessionMessages(undefined)).toEqual([]);
    expect(toSessionMessages({ role: "user" })).toEqual([]);
  });

  it("keeps role, content and timestamp of object entries", () => {
    expect(
      toSessionMessages([
        { role: "user", content: "hi", timestamp: "2026-01-01T00:00:00Z" },
        { role: "assistant", content: "hello" },
      ]),
    ).toEqual([
      { role: "user", content: "hi", timestamp: "2026-01-01T00:00:00Z" },
      { role: "assistant", content: "hello", timestamp: undefined },
    ]);
  });

  it("skips non-object entries and blanks non-string fields", () => {
    expect(
      toSessionMessages(["x", null, [1], { role: 1, content: [] }]),
    ).toEqual([{ role: "", content: "", timestamp: undefined }]);
  });
});

describe("toTranscriptLines", () => {
  it("returns an empty list for non-array values", () => {
    expect(toTranscriptLines(null)).toEqual([]);
    expect(toTranscriptLines(undefined)).toEqual([]);
    expect(toTranscriptLines({ role: "user" })).toEqual([]);
  });

  it("reads role/content and the direction/message/text fallbacks", () => {
    expect(
      toTranscriptLines([
        { role: "assistant", content: "hello" },
        { direction: "outbound", message: "sent" },
        { direction: "inbound", text: "got it" },
        { role: "user", content: 3 },
      ]),
    ).toEqual([
      { fromAssistant: true, speaker: "assistant", text: "hello" },
      { fromAssistant: true, speaker: "outbound", text: "sent" },
      { fromAssistant: false, speaker: "inbound", text: "got it" },
      { fromAssistant: false, speaker: "user", text: 3 },
    ]);
  });

  it("keeps non-object entries as empty lines and drops nested values", () => {
    expect(
      toTranscriptLines(["x", null, { role: "user", content: { a: 1 } }]),
    ).toEqual([
      { fromAssistant: false, speaker: undefined, text: undefined },
      { fromAssistant: false, speaker: undefined, text: undefined },
      { fromAssistant: false, speaker: "user", text: undefined },
    ]);
  });
});
