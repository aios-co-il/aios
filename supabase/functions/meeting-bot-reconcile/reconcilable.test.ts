import { assertEquals } from "jsr:@std/assert@1";
import { isReconcilable, STALE_INGEST_MS } from "./reconcilable.ts";

const now = Date.parse("2026-11-12T12:22:02Z");

Deno.test("a session the webhook is still ingesting is left alone", () => {
  assertEquals(
    isReconcilable(
      { status_detail: "ingesting", updated_at: "2026-11-12T12:20:37Z" },
      now,
    ),
    false,
  );
});

Deno.test("an ingest that died long ago is retried", () => {
  const stale = new Date(now - STALE_INGEST_MS - 1000).toISOString();
  assertEquals(
    isReconcilable({ status_detail: "ingesting", updated_at: stale }, now),
    true,
  );
});

Deno.test("a session waiting for its transcript is retried", () => {
  assertEquals(
    isReconcilable(
      {
        status_detail: "awaiting_transcript",
        updated_at: "2026-11-12T12:20:37Z",
      },
      now,
    ),
    true,
  );
});
