import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  givenLeadSource,
  recordLeadSourceEvent,
} from "./lead-source-events.ts";

function fakeClient() {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  return {
    inserts,
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    }),
  };
}

Deno.test(
  "givenLeadSource returns the trimmed text, or null when none was given",
  () => {
    assertStrictEquals(givenLeadSource("FB"), "FB");
    assertStrictEquals(givenLeadSource("  פייסבוק "), "פייסבוק");
    assertStrictEquals(givenLeadSource("Other"), null);
    assertStrictEquals(givenLeadSource("  "), null);
    assertStrictEquals(givenLeadSource(undefined), null);
  },
);

Deno.test("records a repeat arrival with the source as sent", async () => {
  const client = fakeClient();
  await recordLeadSourceEvent(client, {
    leadId: "lead-1",
    tenantId: "tenant-1",
    source: " FB ",
    campaignName: " מכירות ",
  });
  assertEquals(client.inserts, [
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
});

Deno.test("adds nothing when the arrival names no source", async () => {
  const client = fakeClient();
  await recordLeadSourceEvent(client, { leadId: "lead-1", source: "" });
  await recordLeadSourceEvent(client, { leadId: "lead-1", source: "other" });
  assertStrictEquals(client.inserts.length, 0);
});
