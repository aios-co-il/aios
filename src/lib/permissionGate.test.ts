import { expect, test } from "vitest";
import {
  resolvePermissionGateView,
  type PermissionGateState,
} from "./permissionGate.ts";

function state(
  overrides: Partial<PermissionGateState> = {},
): PermissionGateState {
  return {
    permission: "lead_integrations",
    isSuperAdmin: false,
    isLoading: false,
    isFetching: false,
    isError: false,
    isReady: true,
    isFetchedAfterMount: true,
    allowed: true,
    ...overrides,
  };
}

test("super-admin always sees the page, even if permissions query failed", () => {
  expect(
    resolvePermissionGateView(
      state({
        isSuperAdmin: true,
        isError: true,
        isReady: false,
        isFetchedAfterMount: false,
        allowed: false,
      }),
    ),
  ).toBe("children");
});

test("routes without a permission check never block", () => {
  expect(
    resolvePermissionGateView(state({ permission: undefined, allowed: false })),
  ).toBe("children");
});

test("stale error with cached access does not flash error UI", () => {
  expect(
    resolvePermissionGateView(
      state({
        isError: true,
        isFetching: false,
        isReady: true,
        isFetchedAfterMount: false,
        allowed: true,
      }),
    ),
  ).toBe("children");
});

test("cached error without data does not flash error or redirect on first paint", () => {
  expect(
    resolvePermissionGateView(
      state({
        isError: true,
        isReady: false,
        isFetchedAfterMount: false,
        allowed: false,
      }),
    ),
  ).toBe("skeleton");
});

test("settled load failure without data shows the retry error", () => {
  expect(
    resolvePermissionGateView(
      state({
        isError: true,
        isFetching: false,
        isReady: false,
        isFetchedAfterMount: true,
        allowed: false,
      }),
    ),
  ).toBe("error");
});

test("error that is currently refetching stays on skeleton, not error UI", () => {
  expect(
    resolvePermissionGateView(
      state({
        isError: true,
        isFetching: true,
        isReady: false,
        isFetchedAfterMount: true,
        allowed: false,
      }),
    ),
  ).toBe("skeleton");
});

test("missing permission after a successful load redirects", () => {
  expect(resolvePermissionGateView(state({ allowed: false }))).toBe("redirect");
});

test("first load shows skeleton", () => {
  expect(
    resolvePermissionGateView(
      state({
        isLoading: true,
        isReady: false,
        isFetchedAfterMount: false,
        allowed: false,
      }),
    ),
  ).toBe("skeleton");
});
