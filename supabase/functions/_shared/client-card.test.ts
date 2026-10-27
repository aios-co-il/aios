import {
  assert,
  assertEquals,
  assertMatch,
  assertNotStrictEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";

import {
  ClientCardEntryError,
  buildRecordClientCardEntryArgs,
  hourlyDedupeRef,
  parseRecordClientCardEntryResult,
  recordClientCardEntry,
  stableHash,
} from "./client-card.ts";
import {
  clientCardSourceCanCountAsContact,
  clientCardSourceLabel,
  isHumanClientCardSource,
} from "./client-card-sources.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const CAMPAIGNER_USER = "33333333-3333-4333-8333-333333333333";
const OWNER_USER = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-26T09:15:00Z");

Deno.test(
  "source vocabulary: legacy rows are human, only human and confirmed rows can count",
  () => {
    assertStrictEquals(isHumanClientCardSource(null), true);
    assertStrictEquals(isHumanClientCardSource(undefined), true);
    assertStrictEquals(isHumanClientCardSource("human"), true);
    assertStrictEquals(isHumanClientCardSource("carmen"), false);
    assertStrictEquals(isHumanClientCardSource("future_source"), false);
    assertStrictEquals(clientCardSourceCanCountAsContact("human"), true);
    assertStrictEquals(
      clientCardSourceCanCountAsContact("carmen_confirmed"),
      true,
    );
    for (const source of [
      "carmen",
      "system_send",
      "group_digest",
      "automation",
    ])
      assertStrictEquals(
        clientCardSourceCanCountAsContact(source),
        false,
        source,
      );
    assertStrictEquals(clientCardSourceLabel("human"), null);
    assertStrictEquals(clientCardSourceLabel("carmen_confirmed"), "כרמן");
    assertStrictEquals(clientCardSourceLabel("system_send"), "נשלח מהמערכת");
    assertStrictEquals(clientCardSourceLabel("group_digest"), "סיכום קבוצה");
    assertStrictEquals(clientCardSourceLabel("automation"), "אוטומציה");
  },
);

Deno.test("buildRecordClientCardEntryArgs maps and trims every field", () => {
  const args = buildRecordClientCardEntryArgs({
    tenantId: TENANT,
    clientId: CLIENT,
    content: "  שיחה עם הלקוח  ",
    updateType: " call ",
    source: "carmen_confirmed",
    sourceRef: " ref-1 ",
    attributedUserId: CAMPAIGNER_USER,
    countsAsContact: true,
    metadata: { tool: "x" },
  });
  assertEquals(args, {
    p_tenant: TENANT,
    p_client: CLIENT,
    p_content: "שיחה עם הלקוח",
    p_update_type: "call",
    p_source: "carmen_confirmed",
    p_source_ref: "ref-1",
    p_attributed_user: CAMPAIGNER_USER,
    p_counts_as_contact: true,
    p_metadata: { tool: "x" },
  });
});

Deno.test(
  "buildRecordClientCardEntryArgs leaves attribution to SQL and never passes 'system'",
  () => {
    const args = buildRecordClientCardEntryArgs({
      tenantId: TENANT,
      clientId: CLIENT,
      content: "הערה",
      source: "automation",
      attributedUserId: "system",
    });
    assertStrictEquals(args.p_attributed_user, null);
    assertStrictEquals(args.p_source_ref, null);
    assertStrictEquals(args.p_counts_as_contact, null);
    assertStrictEquals(args.p_update_type, null);
  },
);

Deno.test(
  "buildRecordClientCardEntryArgs refuses unattributed contact and bad input",
  () => {
    const base = {
      tenantId: TENANT,
      clientId: CLIENT,
      content: "x",
    } as const;
    const codeOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (err) {
        assert(err instanceof ClientCardEntryError);
        return err.code;
      }
      return "no_error";
    };
    assertStrictEquals(
      codeOf(() =>
        buildRecordClientCardEntryArgs({ ...base, source: "carmen_confirmed" }),
      ),
      "attribution_required",
    );
    assertStrictEquals(
      codeOf(() =>
        buildRecordClientCardEntryArgs({
          ...base,
          source: "human",
          countsAsContact: true,
        }),
      ),
      "attribution_required",
    );
    assertStrictEquals(
      codeOf(() =>
        buildRecordClientCardEntryArgs({
          ...base,
          source: "system_send",
          attributedUserId: OWNER_USER,
          countsAsContact: true,
        }),
      ),
      "invalid_input",
    );
    assertStrictEquals(
      codeOf(() =>
        buildRecordClientCardEntryArgs({ ...base, source: "bot" as any }),
      ),
      "invalid_input",
    );
    assertStrictEquals(
      codeOf(() =>
        buildRecordClientCardEntryArgs({
          ...base,
          content: "  ",
          source: "carmen",
        }),
      ),
      "invalid_input",
    );
    assertStrictEquals(
      codeOf(() =>
        buildRecordClientCardEntryArgs({
          ...base,
          clientId: "not-a-uuid",
          source: "carmen",
        }),
      ),
      "invalid_input",
    );
  },
);

Deno.test(
  "parseRecordClientCardEntryResult accepts a row or a one-row array",
  () => {
    const row = {
      entry_id: "e1",
      inserted: true,
      attributed_user_id: OWNER_USER,
      attribution: "owner",
    };
    const expected = {
      entryId: "e1",
      inserted: true,
      userId: OWNER_USER,
      attribution: "owner",
    };
    assertEquals(parseRecordClientCardEntryResult([row]), expected);
    assertEquals(parseRecordClientCardEntryResult(row), expected);
    assertThrows(
      () => parseRecordClientCardEntryResult([]),
      ClientCardEntryError,
    );
  },
);

Deno.test(
  "recordClientCardEntry maps the RPC's SQLSTATE to a readable code",
  async () => {
    for (const [sqlstate, code] of [
      ["42501", "access_denied"],
      ["P0002", "not_found"],
      ["22023", "invalid_input"],
      ["XX000", "write_failed"],
    ]) {
      const supabase = {
        rpc: async () => ({
          data: null,
          error: { code: sqlstate, message: "x" },
        }),
      };
      const err = await assertRejects(() =>
        recordClientCardEntry(supabase, {
          tenantId: TENANT,
          clientId: CLIENT,
          content: "x",
          source: "carmen",
        }),
      );
      assertStrictEquals((err as any).code, code);
    }
  },
);

Deno.test(
  "hourlyDedupeRef is stable within the hour and differs by text, person and hour",
  () => {
    const a = hourlyDedupeRef("t", CAMPAIGNER_USER, "note\nhello", NOW);
    assertStrictEquals(
      a,
      hourlyDedupeRef(
        "t",
        CAMPAIGNER_USER,
        "note\nhello",
        new Date("2026-10-26T09:59:59Z"),
      ),
    );
    assertMatch(a, /^t:33333333-3333-4333-8333-333333333333:2026-10-26T09:/);
    assertNotStrictEquals(
      a,
      hourlyDedupeRef("t", CAMPAIGNER_USER, "note\nhello!", NOW),
    );
    assertNotStrictEquals(
      a,
      hourlyDedupeRef("t", OWNER_USER, "note\nhello", NOW),
    );
    assertNotStrictEquals(
      a,
      hourlyDedupeRef(
        "t",
        CAMPAIGNER_USER,
        "note\nhello",
        new Date("2026-10-26T10:00:00Z"),
      ),
    );
    assertMatch(hourlyDedupeRef("t", "system", "x", NOW), /^t:system:/);
    assertStrictEquals(stableHash("שלום"), stableHash("שלום"));
    assertNotStrictEquals(stableHash("שלום"), stableHash("שלום."));
  },
);
