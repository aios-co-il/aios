import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";

import {
  interpretWaSendResponse,
  readWaSendResponse,
} from "./wa-send-result.ts";

Deno.test("only a confirmed 2xx success counts as sent", () => {
  const sent = interpretWaSendResponse(200, { success: true, messageId: "m1" });
  assertStrictEquals(sent.sent, true);
  assertStrictEquals(sent.providerMessageId, "m1");
  assertStrictEquals(
    interpretWaSendResponse(200, { success: true, idMessage: "g1" })
      .providerMessageId,
    "g1",
  );
  assertStrictEquals(
    interpretWaSendResponse(200, { success: false }).status,
    "failed",
  );
  assertStrictEquals(
    interpretWaSendResponse(500, { error: "boom" }).error,
    "boom",
  );
  assertStrictEquals(interpretWaSendResponse(400, {}).error, "HTTP 400");
});

Deno.test(
  "202 delivery unknown, staging block and duplicate skip are distinct",
  () => {
    assertStrictEquals(
      interpretWaSendResponse(202, { success: false, delivered: "unknown" })
        .status,
      "delivery_unknown",
    );
    const blocked = interpretWaSendResponse(403, {
      error: "blocked_by_staging_safe_mode",
      reason: "destination_not_allowlisted",
    });
    assertStrictEquals(blocked.status, "blocked_staging");
    assertMatch(blocked.error, /destination_not_allowlisted/);
    assertStrictEquals(
      interpretWaSendResponse(403, { error: "Forbidden" }).status,
      "failed",
    );
    const dup = interpretWaSendResponse(200, {
      success: true,
      skipped: "duplicate_identical_whatsapp",
    });
    assertStrictEquals(dup.status, "duplicate_skipped");
    assertStrictEquals(dup.sent, false);
  },
);

Deno.test("non-JSON bodies are read as failures with their text", async () => {
  const out = await readWaSendResponse(
    new Response("upstream down", { status: 502 }),
  );
  assertStrictEquals(out.status, "failed");
  assertStrictEquals(out.error, "upstream down");
  assertStrictEquals(out.httpStatus, 502);
});
