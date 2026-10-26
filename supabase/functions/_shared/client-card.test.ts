import assert from "node:assert/strict";
import test from "node:test";

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

test("source vocabulary: legacy rows are human, only human and confirmed rows can count", () => {
  assert.equal(isHumanClientCardSource(null), true);
  assert.equal(isHumanClientCardSource(undefined), true);
  assert.equal(isHumanClientCardSource("human"), true);
  assert.equal(isHumanClientCardSource("carmen"), false);
  assert.equal(isHumanClientCardSource("future_source"), false);
  assert.equal(clientCardSourceCanCountAsContact("human"), true);
  assert.equal(clientCardSourceCanCountAsContact("carmen_confirmed"), true);
  for (const source of ["carmen", "system_send", "group_digest", "automation"])
    assert.equal(clientCardSourceCanCountAsContact(source), false, source);
  assert.equal(clientCardSourceLabel("human"), null);
  assert.equal(clientCardSourceLabel("carmen_confirmed"), "כרמן");
  assert.equal(clientCardSourceLabel("system_send"), "נשלח מהמערכת");
  assert.equal(clientCardSourceLabel("group_digest"), "סיכום קבוצה");
  assert.equal(clientCardSourceLabel("automation"), "אוטומציה");
});

test("buildRecordClientCardEntryArgs maps and trims every field", () => {
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
  assert.deepEqual(args, {
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

test("buildRecordClientCardEntryArgs leaves attribution to SQL and never passes 'system'", () => {
  const args = buildRecordClientCardEntryArgs({
    tenantId: TENANT,
    clientId: CLIENT,
    content: "הערה",
    source: "automation",
    attributedUserId: "system",
  });
  assert.equal(args.p_attributed_user, null);
  assert.equal(args.p_source_ref, null);
  assert.equal(args.p_counts_as_contact, null);
  assert.equal(args.p_update_type, null);
});

test("buildRecordClientCardEntryArgs refuses unattributed contact and bad input", () => {
  const base = {
    tenantId: TENANT,
    clientId: CLIENT,
    content: "x",
  } as const;
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (err) {
      assert.ok(err instanceof ClientCardEntryError);
      return err.code;
    }
    return "no_error";
  };
  assert.equal(
    codeOf(() =>
      buildRecordClientCardEntryArgs({ ...base, source: "carmen_confirmed" }),
    ),
    "attribution_required",
  );
  assert.equal(
    codeOf(() =>
      buildRecordClientCardEntryArgs({
        ...base,
        source: "human",
        countsAsContact: true,
      }),
    ),
    "attribution_required",
  );
  assert.equal(
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
  assert.equal(
    codeOf(() =>
      buildRecordClientCardEntryArgs({ ...base, source: "bot" as any }),
    ),
    "invalid_input",
  );
  assert.equal(
    codeOf(() =>
      buildRecordClientCardEntryArgs({
        ...base,
        content: "  ",
        source: "carmen",
      }),
    ),
    "invalid_input",
  );
  assert.equal(
    codeOf(() =>
      buildRecordClientCardEntryArgs({
        ...base,
        clientId: "not-a-uuid",
        source: "carmen",
      }),
    ),
    "invalid_input",
  );
});

test("parseRecordClientCardEntryResult accepts a row or a one-row array", () => {
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
  assert.deepEqual(parseRecordClientCardEntryResult([row]), expected);
  assert.deepEqual(parseRecordClientCardEntryResult(row), expected);
  assert.throws(
    () => parseRecordClientCardEntryResult([]),
    ClientCardEntryError,
  );
});

test("recordClientCardEntry maps the RPC's SQLSTATE to a readable code", async () => {
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
    await assert.rejects(
      recordClientCardEntry(supabase, {
        tenantId: TENANT,
        clientId: CLIENT,
        content: "x",
        source: "carmen",
      }),
      (err: any) => err.code === code,
    );
  }
});

test("hourlyDedupeRef is stable within the hour and differs by text, person and hour", () => {
  const a = hourlyDedupeRef("t", CAMPAIGNER_USER, "note\nhello", NOW);
  assert.equal(
    a,
    hourlyDedupeRef(
      "t",
      CAMPAIGNER_USER,
      "note\nhello",
      new Date("2026-10-26T09:59:59Z"),
    ),
  );
  assert.match(a, /^t:33333333-3333-4333-8333-333333333333:2026-10-26T09:/);
  assert.notEqual(
    a,
    hourlyDedupeRef("t", CAMPAIGNER_USER, "note\nhello!", NOW),
  );
  assert.notEqual(a, hourlyDedupeRef("t", OWNER_USER, "note\nhello", NOW));
  assert.notEqual(
    a,
    hourlyDedupeRef(
      "t",
      CAMPAIGNER_USER,
      "note\nhello",
      new Date("2026-10-26T10:00:00Z"),
    ),
  );
  assert.match(hourlyDedupeRef("t", "system", "x", NOW), /^t:system:/);
  assert.equal(stableHash("שלום"), stableHash("שלום"));
  assert.notEqual(stableHash("שלום"), stableHash("שלום."));
});
