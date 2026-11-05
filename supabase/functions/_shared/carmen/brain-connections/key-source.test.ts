import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { BUILTIN_BRAIN_KEYS } from "./builtin-keys.ts";
import { fakeDb } from "./fake-db.ts";
import {
  brainEnvFrom,
  type BuiltinKeys,
  type KeySource,
  resolveBuiltinKeys,
} from "./key-source.ts";

type Tables = Record<string, Array<Record<string, unknown>>>;

/** A client serving `tables` (eq / in filters) and Vault `secrets` by row id. */
function fakeClient(tables: Tables, secrets: Record<string, string>) {
  const client = {
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const query = {
        select: () => query,
        eq: (col: string, value: unknown) => {
          filters.push((r) => r[col] === value);
          return query;
        },
        in: (col: string, values: unknown[]) => {
          filters.push((r) => values.includes(r[col]));
          return query;
        },
        then: (resolve: (r: { data: unknown[]; error: null }) => void) =>
          resolve({
            data: (tables[table] ?? []).filter((r) =>
              filters.every((f) => f(r)),
            ),
            error: null,
          }),
      };
      return query;
    },
    rpc: (_fn: string, args: { p_connection_id: string }) =>
      Promise.resolve({
        data: secrets[args.p_connection_id] ?? null,
        error: null,
      }),
  };
  return client;
}

const HOME = "home";
const CLIENT = "client";
const PROJECT = {
  GROK_BOT_WEBHOOK_URL: "https://david.example/hook",
  GROK_BOT_WEBHOOK_KEY: "project-grok-key",
  CURSOR_API_KEY: "project-cursor-key",
  CLAUDE_ROUTINE_ID: "project-routine",
  CLAUDE_ROUTINE_TOKEN: "project-claude-token",
  UNRELATED: "kept",
};

function builtinRow(
  tenant: string,
  slug: string,
  opts: { id?: string; secret?: boolean },
) {
  return {
    id: `${tenant}-${slug}`,
    tenant_id: tenant,
    slug,
    kind: "builtin",
    settings: opts.id ? { external_id: opts.id } : {},
    secret_id: opts.secret ? `v-${tenant}-${slug}` : null,
  };
}

function bySlug(keys: BuiltinKeys[], slug: string): BuiltinKeys {
  const found = keys.find((k) => k.slug === slug);
  if (!found) throw new Error(`no ${slug}`);
  return found;
}

Deno.test("key-source", async (t) => {
  await t.step(
    "a tenant URL is never paired with the project key",
    async () => {
      const sb = fakeClient(
        {
          carmen_brain_home_tenants: [{ tenant_id: CLIENT }],
          carmen_brain_connections: [
            builtinRow(CLIENT, "grok", { id: "https://attacker.example/hook" }),
          ],
        },
        {},
      );
      const keys = await resolveBuiltinKeys(sb, CLIENT, PROJECT);
      const env = brainEnvFrom(PROJECT, keys);
      // The incomplete row is ignored: the home tenant gets the project pair.
      assertStrictEquals(
        env.GROK_BOT_WEBHOOK_URL,
        PROJECT.GROK_BOT_WEBHOOK_URL,
      );
      assertStrictEquals(
        env.GROK_BOT_WEBHOOK_KEY,
        PROJECT.GROK_BOT_WEBHOOK_KEY,
      );
    },
  );

  await t.step(
    "a tenant that is not home and has no share gets no project keys",
    async () => {
      const sb = fakeClient(
        {
          carmen_brain_connections: [
            builtinRow(CLIENT, "grok", { id: "https://attacker.example/hook" }),
          ],
        },
        {},
      );
      const keys = await resolveBuiltinKeys(sb, CLIENT, PROJECT);
      const env = brainEnvFrom(PROJECT, keys);
      assertEquals(
        keys.map((k) => k.source),
        [null, null, null, null, null],
      );
      assertStrictEquals(env.GROK_BOT_WEBHOOK_KEY, undefined);
      assertStrictEquals(env.GROK_BOT_WEBHOOK_URL, undefined);
      assertStrictEquals(env.CURSOR_API_KEY, undefined);
      assertStrictEquals(env.CLAUDE_ROUTINE_TOKEN, undefined);
      assertStrictEquals(env.UNRELATED, "kept");
    },
  );

  await t.step("a tenant's own complete row wins and stays whole", async () => {
    const sb = fakeClient(
      {
        carmen_brain_home_tenants: [{ tenant_id: CLIENT }],
        carmen_brain_connections: [
          builtinRow(CLIENT, "grok", {
            id: "https://own.example/hook",
            secret: true,
          }),
        ],
      },
      { "client-grok": "own-key" },
    );
    const keys = await resolveBuiltinKeys(sb, CLIENT, PROJECT);
    assertEquals(bySlug(keys, "grok"), {
      slug: "grok",
      source: { kind: "own" },
      env: {
        GROK_BOT_WEBHOOK_KEY: "own-key",
        GROK_BOT_WEBHOOK_URL: "https://own.example/hook",
      },
    });
  });

  await t.step(
    "a share from the home tenant passes on the project pair",
    async () => {
      const sb = fakeClient(
        {
          carmen_brain_home_tenants: [{ tenant_id: HOME }],
          carmen_brain_key_shares: [
            {
              source_tenant_id: HOME,
              target_tenant_id: CLIENT,
              builtin_slug: "claude",
            },
          ],
        },
        {},
      );
      const keys = await resolveBuiltinKeys(sb, CLIENT, PROJECT);
      assertEquals(bySlug(keys, "claude"), {
        slug: "claude",
        source: { kind: "shared", fromTenantId: HOME },
        env: {
          CLAUDE_ROUTINE_TOKEN: "project-claude-token",
          CLAUDE_ROUTINE_ID: "project-routine",
        },
      });
      assertStrictEquals(bySlug(keys, "grok").source, null);
    },
  );

  await t.step(
    "a share from a tenant that holds nothing gives nothing",
    async () => {
      const sb = fakeClient(
        {
          carmen_brain_key_shares: [
            {
              source_tenant_id: "other",
              target_tenant_id: CLIENT,
              builtin_slug: "cursor",
            },
          ],
        },
        {},
      );
      const keys = await resolveBuiltinKeys(sb, CLIENT, PROJECT);
      assertStrictEquals(bySlug(keys, "cursor").source, null);
    },
  );

  await t.step(
    "MarketingCaptain is home, DMM uses its share, any other org has nothing (AIO-354)",
    async () => {
      const slugs = BUILTIN_BRAIN_KEYS.map((b) => b.slug);
      const full = Object.fromEntries(
        BUILTIN_BRAIN_KEYS.flatMap((b) => b.envNames.map((n) => [n, `p-${n}`])),
      );
      const sb = fakeDb({
        tables: {
          carmen_brain_home_tenants: [{ tenant_id: HOME }],
          carmen_brain_key_shares: slugs.map((slug) => ({
            source_tenant_id: HOME,
            target_tenant_id: "dmm",
            builtin_slug: slug,
          })),
        },
      });
      const [home, dmm, other] = await Promise.all(
        [HOME, "dmm", CLIENT].map((t) => resolveBuiltinKeys(sb, t, full)),
      );
      const want = (source: KeySource | null) => slugs.map(() => source);
      const src = (keys: Array<BuiltinKeys>) => keys.map((k) => k.source);
      assertEquals(src(home), want({ kind: "project" }));
      assertEquals(src(dmm), want({ kind: "shared", fromTenantId: HOME }));
      assertEquals(brainEnvFrom(full, dmm), brainEnvFrom(full, home));
      assertEquals(src(other), want(null));
    },
  );

  await t.step("a share passes on the source tenant's own row", async () => {
    const sb = fakeClient(
      {
        carmen_brain_key_shares: [
          {
            source_tenant_id: "other",
            target_tenant_id: CLIENT,
            builtin_slug: "cursor",
          },
        ],
        carmen_brain_connections: [
          builtinRow("other", "cursor", { secret: true }),
        ],
      },
      { "other-cursor": "other-cursor-key" },
    );
    const keys = await resolveBuiltinKeys(sb, CLIENT, PROJECT);
    const env = brainEnvFrom(PROJECT, keys);
    assertEquals(bySlug(keys, "cursor").source, {
      kind: "shared",
      fromTenantId: "other",
    });
    assertStrictEquals(env.CURSOR_API_KEY, "other-cursor-key");
  });
});
