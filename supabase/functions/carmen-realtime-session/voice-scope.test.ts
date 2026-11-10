import { assertEquals } from "jsr:@std/assert@1";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { voiceBriefScope } from "./voice-scope.ts";

/** A db whose tables return these rows; a table set to "error" fails. */
function fakeDb(tables: Record<string, unknown>): DbClient {
  return { from } as unknown as DbClient;

  /** One table's query chain. */
  function from(table: string) {
    const value = tables[table];
    const result =
      value === "error"
        ? { data: null, error: { message: "down" } }
        : { data: value ?? [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      maybeSingle: () =>
        Promise.resolve({
          ...result,
          data: Array.isArray(result.data) ? (result.data[0] ?? null) : null,
        }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
    };
    return chain;
  }
}

Deno.test("a manager hears about the whole org", async () => {
  const db = fakeDb({ user_roles: [{ role: "owner" }] });
  assertEquals(await voiceBriefScope(db, "u1", "t1"), { kind: "org" });
});

Deno.test("a team manager hears about the agencies they manage", async () => {
  const db = fakeDb({
    user_roles: [{ role: "team_manager" }],
    user_managed_agencies: [{ agency_id: "a1" }],
  });
  assertEquals(await voiceBriefScope(db, "u1", "t1"), {
    kind: "agencies",
    agencyIds: ["a1"],
  });
});

Deno.test(
  "a campaigner hears only about today's assigned clients",
  async () => {
    const db = fakeDb({
      user_roles: [{ role: "campaigner" }],
      profiles: [{ campaigner_id: "c1" }],
      client_team: [
        { client_id: "now", start_date: "2026-01-01", end_date: null },
        {
          client_id: "ended",
          start_date: "2026-01-01",
          end_date: "2026-02-01",
        },
      ],
    });
    assertEquals(await voiceBriefScope(db, "u1", "t1", "2026-11-10"), {
      kind: "clients",
      clientIds: ["now"],
    });
  },
);

Deno.test("a failed roles read hears about no clients", async () => {
  const db = fakeDb({ user_roles: "error" });
  assertEquals(await voiceBriefScope(db, "u1", "t1"), {
    kind: "clients",
    clientIds: [],
  });
});
