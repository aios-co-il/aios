import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  lazyBrainTail,
  movesToNextLink,
  openRouterTail,
  withBrainTail,
} from "./openrouter-tail.ts";

type Row = Record<string, unknown>;

/** A read-only PostgREST stand-in: eq filters rows, the rest of the chain is ignored. */
function fakeDb(tables: Record<string, Row[]>, secret = "sk-or-key") {
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    Object.assign(builder, {
      select: chain,
      not: chain,
      or: chain,
      order: chain,
      limit: chain,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      maybeSingle: () =>
        Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: rows, error: null }),
    });
    return builder;
  };
  return {
    from: query,
    rpc: () => Promise.resolve({ data: secret, error: null }),
    // deno-lint-ignore no-explicit-any
  } as any;
}

const TENANT = "t1";
const openRouterConnection = {
  id: "conn-or",
  tenant_id: TENANT,
  kind: "chat_model",
  provider_preset: "openrouter",
  slug: "openrouter",
  name: "OpenRouter",
  base_url: "https://8.8.8.8/api/v1",
  model: "google/gemini-3-flash-preview",
  profile: { client_data_ok: true },
  key_last4: "abcd",
  created_at: "2026-10-01",
};
const route = {
  tenant_id: TENANT,
  slug: "openrouter",
  label: "OpenRouter",
  route_type: "model",
  connection_id: "conn-or",
  active: true,
  config: {},
};
const carmen = {
  id: "carmen",
  tenant_id: TENANT,
  name: "Carmen",
  active: true,
};

const tables = (overrides: Partial<Record<string, Row[]>> = {}) => ({
  carmen_brain_connections: [openRouterConnection],
  agent_brain_routes: [route],
  ai_agents: [carmen],
  carmen_command_center_access: [
    {
      tenant_id: TENANT,
      agent_id: "carmen",
      user_id: "u1",
      enabled: true,
      brain_access: { internal: "full", openrouter: "full" },
    },
  ],
  ...overrides,
});

Deno.test(
  "the OpenRouter brain is resolved as the internal engine's last link",
  async () => {
    const targets = await openRouterTail(
      fakeDb(tables()),
      { kind: "user", userId: "u1" },
      { tenant_id: TENANT },
    );
    assertEquals(
      targets.map((target) => [
        target.connectionId,
        target.model,
        target.key,
        target.url,
      ]),
      [
        [
          "conn-or",
          "google/gemini-3-flash-preview",
          "sk-or-key",
          "https://8.8.8.8/api/v1/chat/completions",
        ],
      ],
    );
  },
);

Deno.test("a user without the OpenRouter grant gets no tail", async () => {
  const targets = await openRouterTail(
    fakeDb(
      tables({
        carmen_command_center_access: [
          {
            tenant_id: TENANT,
            agent_id: "carmen",
            user_id: "u1",
            enabled: true,
            brain_access: { internal: "full" },
          },
        ],
      }),
    ),
    { kind: "user", userId: "u1" },
    { tenant_id: TENANT },
  );
  assertEquals(targets, []);
});

Deno.test(
  "an OpenRouter brain not approved for client data gets no tail",
  async () => {
    const targets = await openRouterTail(
      fakeDb(
        tables({
          carmen_brain_connections: [
            { ...openRouterConnection, profile: { client_data_ok: false } },
          ],
        }),
      ),
      { kind: "service", userId: null },
      { tenant_id: TENANT },
    );
    assertEquals(targets, []);
  },
);

Deno.test("no OpenRouter connection or no active route: no tail", async () => {
  const auth = { kind: "service" as const, userId: null };
  assertEquals(
    await openRouterTail(
      fakeDb(tables({ carmen_brain_connections: [] })),
      auth,
      { tenant_id: TENANT },
    ),
    [],
  );
  assertEquals(
    await openRouterTail(
      fakeDb(tables({ agent_brain_routes: [{ ...route, active: false }] })),
      auth,
      { tenant_id: TENANT },
    ),
    [],
  );
});

const internal = (label: string): { label: string; connectionId?: string } => ({
  label,
});
const brain = (label: string, connectionId: string) => ({
  label,
  connectionId,
});

Deno.test(
  "the tail is appended once, after the internal providers, without repeats",
  async () => {
    const chain: { label: string; connectionId?: string }[] = [
      brain("brain:free", "conn-free"),
      internal("openai"),
    ];
    let loads = 0;
    const extend = lazyBrainTail(chain, () => {
      loads++;
      return Promise.resolve([
        brain("brain:openrouter", "conn-or"),
        brain("brain:free again", "conn-free"),
      ]);
    });
    assertStrictEquals(await extend(), true);
    assertStrictEquals(await extend(), false);
    assertStrictEquals(loads, 1);
    assertEquals(
      chain.map((target) => target.label),
      ["brain:free", "openai", "brain:openrouter"],
    );
    assertEquals(
      withBrainTail([internal("google")], [internal("anthropic")]).length,
      2,
    );
  },
);

Deno.test(
  "an empty chain (no provider key) becomes the OpenRouter brain alone",
  async () => {
    const chain: { label: string; connectionId?: string }[] = [];
    await lazyBrainTail(chain, () =>
      Promise.resolve([brain("brain:openrouter", "conn-or")]),
    )();
    assertEquals(chain, [brain("brain:openrouter", "conn-or")]);
    // A tail that fails to load leaves the chain as it was.
    const empty: { label: string; connectionId?: string }[] = [];
    assertStrictEquals(
      await lazyBrainTail(empty, () => Promise.reject(new Error("vault")))(),
      false,
    );
    assertStrictEquals(await lazyBrainTail(empty)(), false);
  },
);

Deno.test(
  "a refused key, an empty balance or a rate limit moves to the next link",
  () => {
    for (const status of [401, 402, 403, 429])
      assertStrictEquals(movesToNextLink(status, "", false), true);
    assertStrictEquals(movesToNextLink(400, "insufficient_quota", false), true);
    assertStrictEquals(movesToNextLink(500, "boom", false), false);
    assertStrictEquals(movesToNextLink(500, "boom", true), true);
  },
);
