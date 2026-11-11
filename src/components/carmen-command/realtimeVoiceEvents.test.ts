import { describe, expect, it } from "vitest";
import {
  parseRealtimeServerEvent,
  readAskCarmenQuestion,
} from "./realtimeVoiceEvents";

describe("parseRealtimeServerEvent", () => {
  it("reads transcript, item and error events", () => {
    expect(
      parseRealtimeServerEvent(
        JSON.stringify({
          type: "response.audio_transcript.delta",
          delta: "hi",
        }),
      ),
    ).toEqual({ type: "response.audio_transcript.delta", delta: "hi" });

    const item = {
      type: "function_call",
      name: "ask_carmen",
      arguments: '{"question":"q"}',
      call_id: "c1",
    };
    expect(
      parseRealtimeServerEvent(
        JSON.stringify({ type: "response.output_item.done", item }),
      )?.item,
    ).toEqual(item);

    expect(
      parseRealtimeServerEvent(
        JSON.stringify({ type: "error", error: { message: "bad" } }),
      )?.error?.message,
    ).toBe("bad");
  });

  it("drops fields with unexpected shapes instead of rejecting the event", () => {
    expect(
      parseRealtimeServerEvent(
        JSON.stringify({
          type: "error",
          delta: 1,
          transcript: {},
          item: "x",
          error: { message: 5 },
        }),
      ),
    ).toEqual({ type: "error", error: {} });
  });

  it("returns null for malformed JSON and non-object payloads", () => {
    expect(parseRealtimeServerEvent("{")).toBeNull();
    expect(parseRealtimeServerEvent("null")).toBeNull();
    expect(parseRealtimeServerEvent('"text"')).toBeNull();
    expect(parseRealtimeServerEvent("[1]")).toBeNull();
  });
});

describe("readAskCarmenQuestion", () => {
  it("reads the question from JSON arguments", () => {
    expect(readAskCarmenQuestion('{"question":"מה המצב?"}')).toBe("מה המצב?");
  });

  it("returns an empty question for malformed arguments", () => {
    expect(readAskCarmenQuestion("{")).toBe("");
    expect(readAskCarmenQuestion(undefined)).toBe("");
    expect(readAskCarmenQuestion('{"question":1}')).toBe("");
    expect(readAskCarmenQuestion("null")).toBe("");
  });
});
