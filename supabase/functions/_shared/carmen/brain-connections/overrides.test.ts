import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { settingString, tenantBrainOverrides } from "./overrides.ts";

type Row = {
  id: string;
  slug: string;
  settings: unknown;
  secret_id: string | null;
  tenant_id: string;
  kind: string;
};

/** A client that serves `rows` and Vault `secrets`, recording the filters. */
function fakeClient(rows: Row[], secrets: Record<string, string>) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (col: string, value: unknown) => {
      filters.push([col, value]);
      return query;
    },
    then: (resolve: (r: { data: Row[]; error: null }) => void) =>
      resolve({
        data: rows.filter((r) =>
          filters.every(([c, v]) => r[c as keyof Row] === v),
        ),
        error: null,
      }),
  };
  const client = {
    from: () => query,
    rpc: async (_fn: string, args: { p_connection_id: string }) => ({
      data: secrets[args.p_connection_id] ?? null,
      error: null,
    }),
  };
  return { client, filters };
}

const T1 = "tenant-1";
const rows: Row[] = [
  {
    id: "c-cursor",
    slug: "cursor",
    settings: {},
    secret_id: "v1",
    tenant_id: T1,
    kind: "builtin",
  },
  {
    id: "c-claude",
    slug: "claude",
    settings: { external_id: " trig_123 " },
    secret_id: null,
    tenant_id: T1,
    kind: "builtin",
  },
  {
    id: "c-other",
    slug: "cursor",
    settings: {},
    secret_id: "v2",
    tenant_id: "tenant-2",
    kind: "builtin",
  },
];

Deno.test(
  "a tenant's built-in keys map to the env names their launchers read",
  async () => {
    const { client, filters } = fakeClient(rows, {
      "c-cursor": "cur-key",
      "c-other": "leak",
    });
    const out = await tenantBrainOverrides(client, T1);
    assertEquals(out, {
      CURSOR_API_KEY: "cur-key",
      CLAUDE_ROUTINE_ID: "trig_123",
    });
    assertEquals(filters, [
      ["tenant_id", T1],
      ["kind", "builtin"],
    ]);
  },
);

Deno.test("settingString reads only string fields of an object", () => {
  assertStrictEquals(settingString({ a: " x " }, "a"), "x");
  assertStrictEquals(settingString({ a: 1 }, "a"), "");
  assertStrictEquals(settingString(null, "a"), "");
  assertStrictEquals(settingString(["x"], "0"), "");
});
