import { describe, expect, test } from "vitest";

import { isClientCallUpdate } from "./clientUpdateType.ts";

describe("isClientCallUpdate", () => {
  test("a call, or a row the database stamped as contact, counts", () => {
    expect(isClientCallUpdate("call")).toBe(true);
    expect(isClientCallUpdate("call", "human")).toBe(true);
    expect(isClientCallUpdate("call", "carmen_confirmed")).toBe(true);
    // A weekly or general update whose text reports a held call (AIO-516).
    expect(isClientCallUpdate("weekly_update", null, true)).toBe(true);
    expect(isClientCallUpdate("general", "human", true)).toBe(true);
  });

  test("other types without the stamp do not count", () => {
    expect(isClientCallUpdate("weekly_update", "human")).toBe(false);
    expect(isClientCallUpdate("general", "human", null)).toBe(false);
    expect(isClientCallUpdate("red_flag", "human")).toBe(false);
  });

  test("automatic sources never count, even with the flag", () => {
    expect(isClientCallUpdate("call", "carmen")).toBe(false);
    expect(isClientCallUpdate("call", "group_digest", true)).toBe(false);
    expect(isClientCallUpdate("general", "system_send", true)).toBe(false);
    expect(isClientCallUpdate("call", "automation")).toBe(false);
  });
});
