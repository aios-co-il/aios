import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { redactSyncError } from "./redact.ts";
import {
  FIRST_PAGE_URL,
  NEXT_PAGE_URL,
  TOKEN,
  denoSendError,
} from "./tests/token-errors.ts";

Deno.test(
  "redactSyncError: removes Meta and Google credentials and is idempotent",
  () => {
    const cases = [
      denoSendError(FIRST_PAGE_URL),
      denoSendError(NEXT_PAGE_URL),
      `https://graph.facebook.com/v21.0/act_123?fields=account_status&access_token=${TOKEN}`,
      `{"error":"invalid","access_token": "${TOKEN}"}`,
      `request failed: Authorization: Bearer ya29.a0AfB_byC-xyz.123`,
      `token ${TOKEN} expired`,
    ];
    for (const text of cases) {
      const redacted = redactSyncError(text);
      assertStrictEquals(redacted.includes(TOKEN), false, redacted);
      assertStrictEquals(redacted.includes("ya29."), false, redacted);
      assertMatch(redacted, /\[redacted\]/);
      assertStrictEquals(redactSyncError(redacted), redacted);
    }
    assertStrictEquals(
      redactSyncError(denoSendError(FIRST_PAGE_URL)),
      "error sending request for url (https://graph.facebook.com/v21.0/act_123/insights?[redacted]): client error (SendRequest): connection closed before message completed",
    );
    assertStrictEquals(
      redactSyncError("(#17) User request limit reached"),
      "(#17) User request limit reached",
    );
  },
);

Deno.test(
  "redacts percent-encoded, single-quoted and hyphenated credentials",
  () => {
    const encoded = redactSyncError(
      "fetch failed: https%3A%2F%2Fgraph.facebook.com%2Fv21.0%2Fact_1%2Finsights%3Faccess_token%3DEAAB1234567890abcdefghijklmnop",
    );
    assertNotMatch(encoded, /EAAB1234567890/);
    const quoted = redactSyncError("{'access_token': 'secret-value-1'}");
    assertNotMatch(quoted, /secret-value-1/);
    const hyphen = redactSyncError("developer-token: dev-secret-2");
    assertNotMatch(hyphen, /dev-secret-2/);
    assertStrictEquals(redactSyncError(redactSyncError(encoded)), encoded);
  },
);
