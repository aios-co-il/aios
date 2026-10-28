import { describe, expect, test } from "vitest";

import {
  canModifyClientUpdate,
  clientUpdateSourceFilterKey,
  isClientUpdateSourceFilter,
  matchesClientUpdateSourceFilter,
} from "./clientUpdateSource.ts";

describe("matchesClientUpdateSourceFilter", () => {
  test("source filter groups Carmen's two sources and treats legacy rows as human", () => {
    expect(clientUpdateSourceFilterKey(null)).toBe("human");
    expect(clientUpdateSourceFilterKey("human")).toBe("human");
    expect(clientUpdateSourceFilterKey("carmen")).toBe("carmen");
    expect(clientUpdateSourceFilterKey("carmen_confirmed")).toBe("carmen");
    expect(clientUpdateSourceFilterKey("system_send")).toBe("system_send");
    expect(matchesClientUpdateSourceFilter("automation", "all")).toBe(true);
    expect(matchesClientUpdateSourceFilter("carmen_confirmed", "carmen")).toBe(
      true,
    );
    expect(matchesClientUpdateSourceFilter(undefined, "human")).toBe(true);
    expect(matchesClientUpdateSourceFilter("carmen", "human")).toBe(false);
  });
});

describe("isClientUpdateSourceFilter", () => {
  test("accepts the listed filters and nothing else", () => {
    expect(isClientUpdateSourceFilter("all")).toBe(true);
    expect(isClientUpdateSourceFilter("automation")).toBe(true);
    expect(isClientUpdateSourceFilter("carmen_confirmed")).toBe(false);
    expect(isClientUpdateSourceFilter("bot")).toBe(false);
  });
});

describe("canModifyClientUpdate", () => {
  test("automatic entries are edited only by owners; own human notes by their author", () => {
    const me = "user-1";
    expect(
      canModifyClientUpdate({
        source: "human",
        rowUserId: me,
        currentUserId: me,
        canManageAutomaticEntries: false,
      }),
    ).toBe(true);

    expect(
      canModifyClientUpdate({
        source: null,
        rowUserId: "someone-else",
        currentUserId: me,
        canManageAutomaticEntries: true,
      }),
    ).toBe(false);

    // A Carmen entry attributed to the campaigner is still not theirs to edit.
    expect(
      canModifyClientUpdate({
        source: "carmen_confirmed",
        rowUserId: me,
        currentUserId: me,
        canManageAutomaticEntries: false,
      }),
    ).toBe(false);

    expect(
      canModifyClientUpdate({
        source: "system_send",
        rowUserId: "someone-else",
        currentUserId: me,
        canManageAutomaticEntries: true,
      }),
    ).toBe(true);
  });
});
