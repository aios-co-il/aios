import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  addClientUpdateFromCarmen,
  recordCarmenHealthCardEntry,
  recordHealthCardEntryAfterUpdate,
} from "./carmen-client-card-tools.ts";
import { fakeCardRpc } from "./fake-card-rpc.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const CAMPAIGNER_USER = "33333333-3333-4333-8333-333333333333";
const OWNER_USER = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-26T09:15:00Z");

Deno.test(
  "add_client_update: a background call is refused without touching the card",
  async () => {
    const { supabase, calls } = fakeCardRpc({ ownerUserId: OWNER_USER });
    const result = await addClientUpdateFromCarmen(supabase, {
      tenantId: TENANT,
      clientId: CLIENT,
      content: "דיברתי עם הלקוח בטלפון",
      updateType: "call",
      humanRequesterUserId: null,
      now: NOW,
    });
    assertStrictEquals(result.success, false);
    assertStrictEquals(result.error, "human_requester_required");
    assertStrictEquals(calls.length, 0);
  },
);

Deno.test(
  "add_client_update: empty text is refused as invalid_input without an RPC call",
  async () => {
    const { supabase, calls } = fakeCardRpc({ ownerUserId: OWNER_USER });
    const result = await addClientUpdateFromCarmen(supabase, {
      tenantId: TENANT,
      clientId: CLIENT,
      content: "   ",
      now: NOW,
    });
    assertEquals(result, {
      success: false,
      error: "invalid_input",
      message: "חסר תוכן לעדכון",
    });
    assertStrictEquals(calls.length, 0);
  },
);

Deno.test(
  "add_client_update: a requested call is carmen_confirmed, attributed and counted",
  async () => {
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
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.created, true);
    assertStrictEquals(result.source, "carmen_confirmed");
    assertStrictEquals(result.attributed_user_id, OWNER_USER);
    assertStrictEquals(result.attribution, "attributed");
    assertStrictEquals(result.counts_as_contact, true);
    assertStrictEquals(calls.length, 1);
    assertStrictEquals(calls[0].name, "record_client_card_entry");
    assertStrictEquals(calls[0].args.p_attributed_user, OWNER_USER);
    assertStrictEquals(calls[0].args.p_counts_as_contact, true);
    assertStrictEquals(calls[0].args.p_update_type, "call");
    assertEquals(calls[0].args.p_metadata, {
      tool: "add_client_update",
      requested_by: OWNER_USER,
      surface: "whatsapp",
    });
  },
);

Deno.test(
  "add_client_update: a background note falls back to the campaigner, then the owner",
  async () => {
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
    assertStrictEquals(
      withCampaigner.calls[0].args.p_attributed_user,
      undefined,
    );
    assertStrictEquals(withCampaigner.calls[0].args.p_source, "carmen");
    assertStrictEquals(a.attributed_user_id, CAMPAIGNER_USER);
    assertStrictEquals(a.attribution, "campaigner");
    assertStrictEquals(a.counts_as_contact, false);

    const ownerOnly = fakeCardRpc({ ownerUserId: OWNER_USER });
    const b = await addClientUpdateFromCarmen(ownerOnly.supabase, {
      tenantId: TENANT,
      clientId: CLIENT,
      content: "הלקוח ביקש דוח חודשי",
      now: NOW,
    });
    assertStrictEquals(b.attributed_user_id, OWNER_USER);
    assertStrictEquals(b.attribution, "owner");
  },
);

Deno.test(
  "add_client_update: a repeated call within the hour returns the first entry",
  async () => {
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
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(calls[0].args.p_source_ref, calls[1].args.p_source_ref);
    assertStrictEquals(first.created, true);
    assertStrictEquals(second.created, false);
    assertStrictEquals(second.update_id, first.update_id);
    assertStrictEquals(typeof second.note, "string");

    const nextHour = await addClientUpdateFromCarmen(supabase, {
      ...input,
      now: new Date("2026-10-26T10:05:00Z"),
    });
    assertStrictEquals(nextHour.created, true);
    assertStrictEquals(rows.length, 2);
  },
);

Deno.test(
  "add_client_update: a client outside the tenant comes back as access_denied",
  async () => {
    const { supabase } = fakeCardRpc({
      error: { code: "42501", message: "client is not in tenant" },
    });
    const result = await addClientUpdateFromCarmen(supabase, {
      tenantId: TENANT,
      clientId: CLIENT,
      content: "הערה",
      now: NOW,
    });
    assertEquals(result, {
      success: false,
      error: "access_denied",
      message: "client is not in tenant",
    });
  },
);

Deno.test(
  "health card entries are source carmen, deduped per hour and mood",
  async () => {
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
    assertStrictEquals(entry.attribution, "campaigner");
    assertStrictEquals(calls[0].args.p_source, "carmen");
    assertStrictEquals(calls[0].args.p_attributed_user, undefined);
    assertStrictEquals(
      calls[0].args.p_content,
      "[עדכון אוטומטי - כרמן] עלייה בעלות לליד",
    );
    assertStrictEquals(calls[0].args.p_counts_as_contact, undefined);
    assertStrictEquals(rows.length, 2);
  },
);

Deno.test("recordHealthCardEntryAfterUpdate", async (t) => {
  const input = {
    tenantId: TENANT,
    clientId: CLIENT,
    note: "עלייה בעלות לליד",
    moodStatus: "wavering",
    tool: "batch_update_client_health" as const,
    now: NOW,
  };

  await t.step("a written entry adds nothing to the tool result", async () => {
    const { supabase, rows } = fakeCardRpc({ ownerUserId: OWNER_USER });
    const fields = await recordHealthCardEntryAfterUpdate(supabase, input);
    assertEquals(fields, {});
    assertStrictEquals(rows.length, 1);
  });

  await t.step(
    "a card refusal becomes card_entry_error, so the health update stands",
    async () => {
      const { supabase, calls } = fakeCardRpc({
        error: {
          code: "42501",
          message: `record_client_card_entry: client ${CLIENT} is not in tenant ${TENANT}`,
        },
      });
      const fields = await recordHealthCardEntryAfterUpdate(supabase, input);
      assertStrictEquals(calls.length, 1);
      assertEquals(fields, {
        card_entry_error: `record_client_card_entry: client ${CLIENT} is not in tenant ${TENANT}`,
      });
    },
  );

  await t.step(
    "any other failure is rethrown, so the tool reports it",
    async () => {
      const outage = new Error("network down");
      const supabase = {
        rpc: () => Promise.reject(outage),
      };
      const thrown = await assertRejects(() =>
        recordHealthCardEntryAfterUpdate(supabase, input),
      );
      assertStrictEquals(thrown, outage);
    },
  );
});
