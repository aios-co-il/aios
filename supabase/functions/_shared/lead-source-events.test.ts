import assert from "node:assert/strict";
import test from "node:test";
import {
  givenLeadSource,
  recordLeadSourceEvent,
} from "./lead-source-events.ts";

function fakeClient() {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  return {
    inserts,
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
  };
}

test("givenLeadSource returns the trimmed text, or null when none was given", () => {
  assert.equal(givenLeadSource("FB"), "FB");
  assert.equal(givenLeadSource("  פייסבוק "), "פייסבוק");
  assert.equal(givenLeadSource("Other"), null);
  assert.equal(givenLeadSource("  "), null);
  assert.equal(givenLeadSource(undefined), null);
});

test("records a repeat arrival with the source as sent", async () => {
  const client = fakeClient();
  await recordLeadSourceEvent(client, {
    leadId: "lead-1",
    tenantId: "tenant-1",
    source: " FB ",
    campaignName: " מכירות ",
  });
  assert.deepEqual(client.inserts, [
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

test("adds nothing when the arrival names no source", async () => {
  const client = fakeClient();
  await recordLeadSourceEvent(client, { leadId: "lead-1", source: "" });
  await recordLeadSourceEvent(client, { leadId: "lead-1", source: "other" });
  assert.equal(client.inserts.length, 0);
});
