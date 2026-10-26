// AIO-231: get_chat_contacts is re-created to call
// chat_allowed_connection_user_ids. These checks prove, from the SQL text, that
// its body is unchanged except for that call and that the helper is the old
// inline rule. A fixture run on a disposable PostgreSQL compared old and new
// get_chat_contacts row by row; supabase/ops/verify_chat_allowed_connections.sql
// repeats the helper check on a live database.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrations = new URL("../../../migrations/", import.meta.url);
const baseline = readFileSync(
  new URL("20261009000000_production_baseline.sql", migrations),
  "utf8",
);
const migration = readFileSync(
  new URL("20261026125000_carmen_chat_scope_connections.sql", migrations),
  "utf8",
);

const CONTACTS_HEAD =
  'CREATE OR REPLACE FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid", "p_connection_user_ids" "uuid"[], "p_provider" "public"."chat_provider")';

function functionText(sql, head) {
  const start = sql.indexOf(head);
  assert.ok(start >= 0, `missing ${head}`);
  const end = sql.indexOf("\n$$;", start);
  return sql.slice(start, end + 4);
}

const oldContacts = functionText(baseline, CONTACTS_HEAD);
const newContacts = functionText(migration, CONTACTS_HEAD);
const INLINE_START =
  "  SELECT array_agg(DISTINCT owners.owner_id)\n  INTO allowed_user_ids";
const INLINE_END = "  ) owners;";
const inlineRule = oldContacts.slice(
  oldContacts.indexOf(INLINE_START),
  oldContacts.indexOf(INLINE_END) + INLINE_END.length,
);
const squash = (s) => s.replace(/\s+/g, " ").trim();

test("get_chat_contacts keeps its body except the connection rule", () => {
  assert.ok(inlineRule.includes("connection_visibility = 'org'"));
  assert.equal(
    newContacts,
    oldContacts.replace(
      inlineRule,
      "  allowed_user_ids := public.chat_allowed_connection_user_ids(current_tenant_id, current_user_id);",
    ),
  );
});

test("the helper is the old inline rule with the caller as arguments", () => {
  const helper = functionText(
    migration,
    "CREATE OR REPLACE FUNCTION public.chat_allowed_connection_user_ids(",
  );
  const body = squash(helper.slice(helper.indexOf("AS $$") + 5, -4));
  const expected = squash(
    inlineRule
      .replace("INTO allowed_user_ids", "")
      .replace(
        "array_agg(DISTINCT owners.owner_id)",
        "COALESCE(array_agg(DISTINCT owners.owner_id), ARRAY[]::uuid[])",
      )
      .replace("is_admin", "COALESCE(public.is_super_admin(p_user_id), false)")
      .replaceAll("current_user_id", "p_user_id")
      .replaceAll("current_tenant_id", "p_tenant_id")
      .replace(
        ") owners;",
        ") owners WHERE p_tenant_id IS NOT NULL AND p_user_id IS NOT NULL AND owners.owner_id IS NOT NULL;",
      ),
  );
  assert.equal(body, expected);
  assert.match(helper, /SECURITY DEFINER/);
  assert.match(helper, /SET search_path TO 'public'/);
  assert.match(helper, /RETURNS uuid\[\]/);
});

test("only the service role may call the helper; get_chat_contacts grants stay", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.chat_allowed_connection_user_ids\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.chat_allowed_connection_user_ids\(uuid, uuid\) TO service_role;/,
  );
  assert.doesNotMatch(migration, /(GRANT|REVOKE)[^;]*get_chat_contacts/);
});
