import assert from "node:assert/strict";
import test from "node:test";

import {
  interpretWaSendResponse,
  readWaSendResponse,
} from "./wa-send-result.ts";

test("only a confirmed 2xx success counts as sent", () => {
  const sent = interpretWaSendResponse(200, { success: true, messageId: "m1" });
  assert.equal(sent.sent, true);
  assert.equal(sent.providerMessageId, "m1");
  assert.equal(
    interpretWaSendResponse(200, { success: true, idMessage: "g1" })
      .providerMessageId,
    "g1",
  );
  assert.equal(
    interpretWaSendResponse(200, { success: false }).status,
    "failed",
  );
  assert.equal(interpretWaSendResponse(500, { error: "boom" }).error, "boom");
  assert.equal(interpretWaSendResponse(400, {}).error, "HTTP 400");
});

test("202 delivery unknown, staging block and duplicate skip are distinct", () => {
  assert.equal(
    interpretWaSendResponse(202, { success: false, delivered: "unknown" })
      .status,
    "delivery_unknown",
  );
  const blocked = interpretWaSendResponse(403, {
    error: "blocked_by_staging_safe_mode",
    reason: "destination_not_allowlisted",
  });
  assert.equal(blocked.status, "blocked_staging");
  assert.match(blocked.error, /destination_not_allowlisted/);
  assert.equal(
    interpretWaSendResponse(403, { error: "Forbidden" }).status,
    "failed",
  );
  const dup = interpretWaSendResponse(200, {
    success: true,
    skipped: "duplicate_identical_whatsapp",
  });
  assert.equal(dup.status, "duplicate_skipped");
  assert.equal(dup.sent, false);
});

test("non-JSON bodies are read as failures with their text", async () => {
  const out = await readWaSendResponse(
    new Response("upstream down", { status: 502 }),
  );
  assert.equal(out.status, "failed");
  assert.equal(out.error, "upstream down");
  assert.equal(out.httpStatus, 502);
});
