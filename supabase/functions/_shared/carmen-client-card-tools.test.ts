import assert from "node:assert/strict";
import test from "node:test";

import {
  addClientUpdateFromCarmen,
  recordCarmenHealthCardEntry,
} from "./carmen-client-card-tools.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const CAMPAIGNER_USER = "33333333-3333-4333-8333-333333333333";
const OWNER_USER = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-26T09:15:00Z");

/**
 * In-memory stand-in for record_client_card_entry that follows the SQL
 * contract: dedupe on (client, source, source_ref), and attribute to the named
 * person, else the client's campaigner, else the owner.
 */
function fakeCardRpc(opts: {
  campaignerUserId?: string | null;
  ownerUserId?: string | null;
  error?: { code: string; message: string };
}) {
  const rows: any[] = [];
  const calls: any[] = [];
  const supabase = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      if (opts.error) return { data: null, error: opts.error };
      if (args.p_source_ref) {
        const existing = rows.find(
          (row) =>
            row.client_id === args.p_client &&
            row.source === args.p_source &&
            row.source_ref === args.p_source_ref,
        );
        if (existing)
          return {
            data: [
              {
                entry_id: existing.id,
                inserted: false,
                attributed_user_id: existing.user_id,
                attribution: "existing",
              },
            ],
            error: null,
          };
      }
      const [userId, attribution] = args.p_attributed_user
        ? [args.p_attributed_user, "attributed"]
        : opts.campaignerUserId
          ? [opts.campaignerUserId, "campaigner"]
          : [opts.ownerUserId, "owner"];
      const row = {
        id: `entry-${rows.length + 1}`,
        client_id: args.p_client,
        source: args.p_source,
        source_ref: args.p_source_ref,
        user_id: userId,
      };
      rows.push(row);
      return {
        data: [
          {
            entry_id: row.id,
            inserted: true,
            attributed_user_id: userId,
            attribution,
          },
        ],
        error: null,
      };
    },
  };
  return { supabase, rows, calls };
}

test("add_client_update: a background call is refused without touching the card", async () => {
  const { supabase, calls } = fakeCardRpc({ ownerUserId: OWNER_USER });
  const result = await addClientUpdateFromCarmen(supabase, {
    tenantId: TENANT,
    clientId: CLIENT,
    content: "דיברתי עם הלקוח בטלפון",
    updateType: "call",
    humanRequesterUserId: null,
    now: NOW,
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "human_requester_required");
  assert.equal(calls.length, 0);
});

test("add_client_update: a requested call is carmen_confirmed, attributed and counted", async () => {
  const { supabase, calls } = fakeCardRpc({
    campaignerUserId: CAMPAIGNER_USER,
    ownerUserId: OWNER_USER,
  });
  const result = await addClientUpdateFromCarmen(supabase, {
    tenantId: TENANT,
    clientId: CLIENT,
    content: "שיחה עם הלקוח על התקציב",
    updateType: "call",
    humanRequesterUserId: OWNER_USER,
    surface: "whatsapp",
    now: NOW,
  });
  assert.equal(result.success, true);
  assert.equal(result.created, true);
  assert.equal(result.source, "carmen_confirmed");
  assert.equal(result.attributed_user_id, OWNER_USER);
  assert.equal(result.attribution, "attributed");
  assert.equal(result.counts_as_contact, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "record_client_card_entry");
  assert.equal(calls[0].args.p_attributed_user, OWNER_USER);
  assert.equal(calls[0].args.p_counts_as_contact, true);
  assert.equal(calls[0].args.p_update_type, "call");
  assert.deepEqual(calls[0].args.p_metadata, {
    tool: "add_client_update",
    requested_by: OWNER_USER,
    surface: "whatsapp",
  });
});

test("add_client_update: a background note falls back to the campaigner, then the owner", async () => {
  const withCampaigner = fakeCardRpc({
    campaignerUserId: CAMPAIGNER_USER,
    ownerUserId: OWNER_USER,
  });
  const a = await addClientUpdateFromCarmen(withCampaigner.supabase, {
    tenantId: TENANT,
    clientId: CLIENT,
    content: "הלקוח ביקש דוח חודשי",
    now: NOW,
  });
  assert.equal(withCampaigner.calls[0].args.p_attributed_user, null);
  assert.equal(withCampaigner.calls[0].args.p_source, "carmen");
  assert.equal(a.attributed_user_id, CAMPAIGNER_USER);
  assert.equal(a.attribution, "campaigner");
  assert.equal(a.counts_as_contact, false);

  const ownerOnly = fakeCardRpc({ ownerUserId: OWNER_USER });
  const b = await addClientUpdateFromCarmen(ownerOnly.supabase, {
    tenantId: TENANT,
    clientId: CLIENT,
    content: "הלקוח ביקש דוח חודשי",
    now: NOW,
  });
  assert.equal(b.attributed_user_id, OWNER_USER);
  assert.equal(b.attribution, "owner");
});

test("add_client_update: a repeated call within the hour returns the first entry", async () => {
  const { supabase, rows, calls } = fakeCardRpc({ ownerUserId: OWNER_USER });
  const input = {
    tenantId: TENANT,
    clientId: CLIENT,
    content: "דיברתי עם הלקוח",
    updateType: "call",
    humanRequesterUserId: CAMPAIGNER_USER,
    now: NOW,
  };
  const first = await addClientUpdateFromCarmen(supabase, input);
  const second = await addClientUpdateFromCarmen(supabase, {
    ...input,
    content: "  דיברתי עם הלקוח ",
    now: new Date("2026-10-26T09:40:00Z"),
  });
  assert.equal(rows.length, 1);
  assert.equal(calls[0].args.p_source_ref, calls[1].args.p_source_ref);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.update_id, first.update_id);
  assert.equal(typeof second.note, "string");

  const nextHour = await addClientUpdateFromCarmen(supabase, {
    ...input,
    now: new Date("2026-10-26T10:05:00Z"),
  });
  assert.equal(nextHour.created, true);
  assert.equal(rows.length, 2);
});

test("add_client_update: a client outside the tenant comes back as access_denied", async () => {
  const { supabase } = fakeCardRpc({
    error: { code: "42501", message: "client is not in tenant" },
  });
  const result = await addClientUpdateFromCarmen(supabase, {
    tenantId: TENANT,
    clientId: CLIENT,
    content: "הערה",
    now: NOW,
  });
  assert.deepEqual(result, {
    success: false,
    error: "access_denied",
    message: "client is not in tenant",
  });
});

test("health card entries are source carmen, deduped per hour and mood", async () => {
  const { supabase, calls, rows } = fakeCardRpc({
    campaignerUserId: CAMPAIGNER_USER,
  });
  const input = {
    tenantId: TENANT,
    clientId: CLIENT,
    note: "עלייה בעלות לליד",
    moodStatus: "wavering",
    requesterUserId: "system",
    tool: "update_client_health" as const,
    now: NOW,
  };
  const entry = await recordCarmenHealthCardEntry(supabase, input);
  await recordCarmenHealthCardEntry(supabase, input);
  await recordCarmenHealthCardEntry(supabase, {
    ...input,
    moodStatus: "churn_risk",
  });
  assert.equal(entry.attribution, "campaigner");
  assert.equal(calls[0].args.p_source, "carmen");
  assert.equal(calls[0].args.p_attributed_user, null);
  assert.equal(
    calls[0].args.p_content,
    "[עדכון אוטומטי - כרמן] עלייה בעלות לליד",
  );
  assert.equal(calls[0].args.p_counts_as_contact, null);
  assert.equal(rows.length, 2);
});
