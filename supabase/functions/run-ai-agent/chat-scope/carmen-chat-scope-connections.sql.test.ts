// AIO-231: get_chat_contacts is re-created to call
// chat_allowed_connection_user_ids. These checks prove, from the SQL text, that
// its body is unchanged except for that call and that the helper is the old
// inline rule. supabase/tests/carmen_chat_scope_connections.sql checks the
// helper and its grants on a database.
import {
  assert,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
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
const INLINE_START =
  "  SELECT array_agg(DISTINCT owners.owner_id)\n  INTO allowed_user_ids";
const INLINE_END = "  ) owners;";

const oldContacts = functionText(baseline, CONTACTS_HEAD);
const newContacts = functionText(migration, CONTACTS_HEAD);
const inlineRule = oldContacts.slice(
  oldContacts.indexOf(INLINE_START),
  oldContacts.indexOf(INLINE_END) + INLINE_END.length,
);

Deno.test("chat_allowed_connection_user_ids migration", async (t) => {
  await t.step(
    "get_chat_contacts keeps its body except the connection rule",
    () => {
      assert(inlineRule.includes("connection_visibility = 'org'"));
      assertStrictEquals(
        newContacts,
        oldContacts.replace(
          inlineRule,
          "  allowed_user_ids := public.chat_allowed_connection_user_ids(current_tenant_id, current_user_id);",
        ),
      );
    },
  );

  await t.step(
    "the helper is the old inline rule with the caller as arguments",
    () => {
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
          .replace(
            "is_admin",
            "COALESCE(public.is_super_admin(p_user_id), false)",
          )
          .replaceAll("current_user_id", "p_user_id")
          .replaceAll("current_tenant_id", "p_tenant_id")
          .replace(
            ") owners;",
            ") owners WHERE p_tenant_id IS NOT NULL AND p_user_id IS NOT NULL AND owners.owner_id IS NOT NULL;",
          ),
      );
      assertStrictEquals(body, expected);
      assertMatch(helper, /SECURITY DEFINER/);
      assertMatch(helper, /SET search_path TO 'public'/);
      assertMatch(helper, /RETURNS uuid\[\]/);
    },
  );

  await t.step(
    "only the service role may call the helper; get_chat_contacts grants stay",
    () => {
      assertMatch(
        migration,
        /REVOKE ALL ON FUNCTION public\.chat_allowed_connection_user_ids\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/,
      );
      assertMatch(
        migration,
        /GRANT EXECUTE ON FUNCTION public\.chat_allowed_connection_user_ids\(uuid, uuid\) TO service_role;/,
      );
      assertNotMatch(migration, /(GRANT|REVOKE)[^;]*get_chat_contacts/);
    },
  );
});

/** The CREATE FUNCTION statement that starts with `head`, through its `$$;`. */
function functionText(sql: string, head: string): string {
  const start = sql.indexOf(head);
  assert(start >= 0, `missing ${head}`);
  const end = sql.indexOf("\n$$;", start);
  return sql.slice(start, end + 4);
}

/** Collapses every whitespace run to one space. */
function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
