import { describe, expect, test } from "vitest";

import {
  isClientCallUpdate,
  resolveClientUpdateType,
} from "./clientUpdateType.ts";

const CALL_NOTE = "דיברתי עם הלקוח בטלפון על התקציב";

describe("resolveClientUpdateType", () => {
  test("a person's weekly update that documents a call becomes a call", () => {
    expect(resolveClientUpdateType("weekly_update", CALL_NOTE)).toBe("call");
    expect(resolveClientUpdateType("weekly_update", CALL_NOTE, "human")).toBe(
      "call",
    );
    expect(
      resolveClientUpdateType("weekly_update", "לא הצלחתי לדבר עם הלקוח"),
    ).toBe("weekly_update");
  });

  test("entries no person typed are never reclassified as calls", () => {
    for (const source of [
      "carmen",
      "carmen_confirmed",
      "system_send",
      "group_digest",
      "automation",
    ]) {
      expect(
        resolveClientUpdateType("weekly_update", CALL_NOTE, source),
        source,
      ).toBe("weekly_update");
    }
  });
});

describe("isClientCallUpdate", () => {
  test("contact counting mirrors get_latest_client_call_updates", () => {
    expect(isClientCallUpdate("call", "x")).toBe(true);
    expect(isClientCallUpdate("call", "x", "human")).toBe(true);
    expect(isClientCallUpdate("weekly_update", CALL_NOTE, null)).toBe(true);
    expect(
      isClientCallUpdate("weekly_update", CALL_NOTE, "carmen_confirmed"),
    ).toBe(true);
    expect(
      isClientCallUpdate("meeting", "פגישה", "carmen_confirmed", true),
    ).toBe(true);
    // Plain meetings keep today's rule.
    expect(isClientCallUpdate("meeting", "פגישה", "human")).toBe(false);
    // Automatic sources never count, even with the flag or call text.
    expect(isClientCallUpdate("call", "x", "carmen")).toBe(false);
    expect(isClientCallUpdate("weekly_update", CALL_NOTE, "system_send")).toBe(
      false,
    );
    expect(isClientCallUpdate("call", "x", "group_digest", true)).toBe(false);
    expect(isClientCallUpdate("call", "x", "automation")).toBe(false);
  });
});
