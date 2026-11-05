import { expect, test } from "vitest";
import {
  CURSOR_CREATIVE_SPEND_MESSAGE,
  isCursorCreativeSpendError,
  isCursorCreativeUnavailable,
} from "./cursorCreativeUnavailable.ts";

test("missing edge function falls back to local generation", () => {
  expect(
    isCursorCreativeUnavailable(new Error("Requested function was not found")),
  ).toBe(true);
  expect(
    isCursorCreativeUnavailable(
      new Error("Failed to send a request to the Edge Function"),
    ),
  ).toBe(true);
});

test("live agent errors do not silently fall back to local generation", () => {
  expect(isCursorCreativeUnavailable(new Error("unauthorized"))).toBe(false);
  expect(
    isCursorCreativeUnavailable(new Error("CURSOR_API_KEY is not configured")),
  ).toBe(false);
  expect(isCursorCreativeUnavailable(new Error("item not found"))).toBe(false);
  expect(
    isCursorCreativeUnavailable(
      new Error("Cursor agent create 401: invalid key"),
    ),
  ).toBe(false);
  expect(
    isCursorCreativeUnavailable(new Error("אייג׳נט הקריאייטיב נכשל")),
  ).toBe(false);
});

test("Cloud Agent spend is distinct from a missing function", () => {
  expect(isCursorCreativeSpendError(new Error("no credits remaining"))).toBe(
    true,
  );
  expect(isCursorCreativeSpendError(new Error("Enable on-demand usage"))).toBe(
    true,
  );
  expect(
    isCursorCreativeSpendError(
      new Error("Cursor agent create 402: payment required"),
    ),
  ).toBe(true);
  expect(isCursorCreativeSpendError(new Error("נגמרו הקרדיטים"))).toBe(true);
  expect(isCursorCreativeSpendError(new Error("unauthorized"))).toBe(false);
  expect(CURSOR_CREATIVE_SPEND_MESSAGE).toMatch(/Pro\+/);
  expect(CURSOR_CREATIVE_SPEND_MESSAGE).toMatch(/dashboard\/spending/);
  expect(CURSOR_CREATIVE_SPEND_MESSAGE).toMatch(/קריאייטיב דיירקט/);
});
