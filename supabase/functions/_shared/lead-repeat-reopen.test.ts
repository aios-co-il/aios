import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  applyRepeatInboundReopen,
  reopenRepeatLead,
  withoutNewLeadOriginColumns,
} from "./lead-repeat-reopen.ts";

/** Fake client: the leads update resolves to `updateError`; inserts are kept. */
function fakeIntakeDb(updateError: { message: string } | null) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const db = {
    from: (table: string) => ({
      update: () => ({ eq: async () => ({ error: updateError }) }),
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
  };
  return { db, inserts };
}

const returningLead = { id: "lead-1", tenant_id: "tenant-1" };

Deno.test(
  "a reopened lead gets its arrival in the source history",
  async () => {
    const { db, inserts } = fakeIntakeDb(null);
    const { error } = await reopenRepeatLead(
      db,
      returningLead,
      { notes: "x" },
      {
        source: "FB",
        campaignName: "מכירות",
      },
    );
    assertStrictEquals(error, null);
    assertEquals(inserts, [
      {
        table: "lead_source_events",
        row: {
          lead_id: "lead-1",
          tenant_id: "tenant-1",
          source: "FB",
          campaign_name: "מכירות",
        },
      },
    ]);
  },
);

Deno.test(
  "a failed lead update returns its error and adds no history row",
  async () => {
    const { db, inserts } = fakeIntakeDb({ message: "timeout" });
    const { error } = await reopenRepeatLead(
      db,
      returningLead,
      {},
      {
        source: "FB",
      },
    );
    assertEquals(error, { message: "timeout" });
    assertStrictEquals(inserts.length, 0);
  },
);

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
  "repeat inbound without a recognised source keeps the stored source",
  () => {
    for (const source of ["other", "", null, undefined]) {
      const updates = applyRepeatInboundReopen(
        {
          created_at: "2026-10-13T21:13:28.000Z",
          source: "paid_ads",
          first_source: "paid_ads",
        },
        { source },
        "2026-10-13T21:13:30.000Z",
      );
      assertStrictEquals(updates.source, undefined);
      assertStrictEquals(updates.first_source, "paid_ads");
    }
  },
);

Deno.test("repeat inbound keeps the sent source text as is", () => {
  const updates = applyRepeatInboundReopen(
    { created_at: "2026-10-13T21:13:28.000Z", source: "paid_ads" },
    { source: " FB " },
    "2026-10-22T11:45:00.000Z",
  );
  assertStrictEquals(updates.source, "FB");
  assertStrictEquals(updates.first_source, "paid_ads");
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
