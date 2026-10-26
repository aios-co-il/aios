import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  formatCloudAgentError,
  grokUsesExistingWebhook,
  isCursorSpendLimitError,
} from "./cloud-errors.ts";

Deno.test("Grok uses the existing webhook when both secrets exist", () => {
  assertStrictEquals(grokUsesExistingWebhook("", "k"), false);
  assertStrictEquals(grokUsesExistingWebhook("https://example", ""), false);
  assertStrictEquals(grokUsesExistingWebhook("https://example", "k"), true);
});

Deno.test("spend-limit 400 becomes Hebrew, not a raw Cursor dump", () => {
  const msg = formatCloudAgentError(
    400,
    "Usage-based pricing required. Background Agent requires at least $2 remaining until your hard limit.",
  );
  assertMatch(msg, /תקציב/);
  assertMatch(msg, /cursor\.com\/dashboard/);
  assertMatch(msg, /Cursor Cloud/);
  assertStrictEquals(isCursorSpendLimitError(msg), true);
});

Deno.test("401 stays a key error", () => {
  assertMatch(formatCloudAgentError(401, "Invalid User API Key"), /מפתח/);
});
