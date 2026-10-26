import { expect, test } from "vitest";
import { isQueryResolving, shouldShowQueryError } from "./queryUi.ts";

test('background refetch is "resolving" but must not drive full-page blank alone', () => {
  // isFetching=true with cached data is normal — UI should keep showing data.
  expect(isQueryResolving(false, false, true)).toBe(true);
  // First load (pending, no data yet) is the only case that should blank the page.
  expect(isQueryResolving(true, true, true)).toBe(true);
  expect(isQueryResolving(false, false, false)).toBe(false);
});

test("shouldShowQueryError hides errors while a fetch is in flight", () => {
  expect(shouldShowQueryError(true, true, false, false)).toBe(false);
  expect(shouldShowQueryError(true, false, false, false)).toBe(true);
  expect(shouldShowQueryError(false, false, false, false)).toBe(false);
});

test("shouldShowQueryError hides cached errors until this observer has fetched", () => {
  expect(shouldShowQueryError(true, false, false, false, false)).toBe(false);
  expect(shouldShowQueryError(true, false, false, false, true)).toBe(true);
});
