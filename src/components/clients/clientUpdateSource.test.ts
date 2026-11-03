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
  const me = "user-1";
  const myTenant = "tenant-dmm";
  const otherTenant = "tenant-mc";
  const row = {
    rowUserId: "someone-else",
    currentUserId: me,
    rowTenantId: myTenant,
    currentTenantId: myTenant,
  };

  test("own human notes are edited by their author only", () => {
    expect(
      canModifyClientUpdate({
        ...row,
        source: "human",
        rowUserId: me,
        canManageAutomaticEntries: false,
      }),
    ).toBe(true);

    expect(
      canModifyClientUpdate({
        ...row,
        source: null,
        canManageAutomaticEntries: true,
      }),
    ).toBe(false);
  });

  test("automatic entries are edited only by owners of the tenant that wrote them", () => {
    // A Carmen entry attributed to the campaigner is still not theirs to edit.
    expect(
      canModifyClientUpdate({
        ...row,
        source: "carmen_confirmed",
        rowUserId: me,
        canManageAutomaticEntries: false,
      }),
    ).toBe(false);

    expect(
      canModifyClientUpdate({
        ...row,
        source: "system_send",
        canManageAutomaticEntries: true,
      }),
    ).toBe(true);
  });

  test("an automatic entry another org wrote on a shared client stays read-only", () => {
    expect(
      canModifyClientUpdate({
        ...row,
        source: "carmen",
        rowTenantId: otherTenant,
        canManageAutomaticEntries: true,
      }),
    ).toBe(false);

    expect(
      canModifyClientUpdate({
        ...row,
        source: "automation",
        currentTenantId: null,
        canManageAutomaticEntries: true,
      }),
    ).toBe(false);
  });
});
