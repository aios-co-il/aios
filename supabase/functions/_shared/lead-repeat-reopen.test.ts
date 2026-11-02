import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  applyRepeatInboundReopen,
  withoutNewLeadOriginColumns,
} from "./lead-repeat-reopen.ts";

Deno.test("repeat inbound bumps created_at and keeps the original date", () => {
  const updates = applyRepeatInboundReopen(
    {
      created_at: "2026-04-15T00:00:00.000Z",
      source: "paid_ads",
    },
    { source: "paid_ads" },
    "2026-08-25T15:00:00.000Z",
  );
  assertStrictEquals(updates.first_created_at, "2026-04-15T00:00:00.000Z");
  assertStrictEquals(updates.created_at, "2026-08-25T15:00:00.000Z");
  assertStrictEquals(updates.first_source, "paid_ads");
  assertStrictEquals(updates.source, undefined);
});

Deno.test(
  "repeat inbound with a new channel keeps first_source and updates source",
  () => {
    const updates = applyRepeatInboundReopen(
      {
        created_at: "2026-04-15T00:00:00.000Z",
        first_created_at: "2026-04-15T00:00:00.000Z",
        source: "paid_ads",
        first_source: "paid_ads",
      },
      { source: "whatsapp" },
      "2026-08-25T15:00:00.000Z",
    );
    assertStrictEquals(updates.first_source, "paid_ads");
    assertStrictEquals(updates.source, "whatsapp");
    assertStrictEquals(updates.first_created_at, "2026-04-15T00:00:00.000Z");
  },
);

Deno.test("does not overwrite an already stored first_created_at", () => {
  const updates = applyRepeatInboundReopen(
    {
      created_at: "2026-08-01T00:00:00.000Z",
      first_created_at: "2026-04-15T00:00:00.000Z",
      source: "website",
      first_source: "paid_ads",
    },
    { source: "cold_call" },
    "2026-08-25T15:00:00.000Z",
  );
  assertStrictEquals(updates.first_created_at, "2026-04-15T00:00:00.000Z");
  assertStrictEquals(updates.first_source, "paid_ads");
  assertStrictEquals(updates.source, "cold_call");
});

Deno.test(
  "fallback strip drops reopen columns so pre-migration updates still work",
  () => {
    const stripped = withoutNewLeadOriginColumns({
      notes: "x",
      created_at: "now",
      first_created_at: "old",
      first_source: "paid_ads",
      archived_at: null,
    });
    assertEquals(stripped, { notes: "x" });
  },
);
