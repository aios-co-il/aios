import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { type EngineConnection, planBrainEngine } from "./plan.ts";

const conn = (
  id: string,
  profile: EngineConnection["profile"],
  extra: Partial<EngineConnection> = {},
): EngineConnection => ({
  id,
  slug: id,
  name: id,
  base_url: "https://api.example.com/v1",
  model: "m",
  key_last4: "1234",
  profile,
  ...extra,
});
const ok = { tier: "free" as const, client_data_ok: true };
const conns = [
  conn("paid", { client_data_ok: true }),
  conn("free-a", ok),
  conn("free-unapproved", { tier: "free" }),
  conn("free-nokey", ok, { key_last4: null }),
  conn("free-b", ok),
];
const modelRoutes = conns.map((c) => ({
  slug: c.slug,
  connection_id: c.id,
  active: true,
}));
const route = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  label: slug,
  route_type: "model",
  connection_id: slug,
  active: true,
  config: null,
  ...extra,
});
const smart = route("smart", {
  connection_id: null,
  config: { router: "free_first" },
});
const all = () => true;

Deno.test("non-model routes run Carmen's own engine", () => {
  assertEquals(planBrainEngine(null, conns, modelRoutes, all), {
    kind: "internal",
  });
  assertEquals(
    planBrainEngine(
      route("internal", { route_type: "internal" }),
      conns,
      modelRoutes,
      all,
    ),
    { kind: "internal" },
  );
});

Deno.test(
  "a picked brain runs Carmen's loop only when approved for client data",
  () => {
    const paid = planBrainEngine(route("paid"), conns, modelRoutes, all);
    assertStrictEquals(paid.kind, "connections");
    assertEquals(
      paid.kind === "connections" && paid.connections.map((c) => c.id),
      ["paid"],
    );
    assertStrictEquals(
      paid.kind === "connections" && paid.fallbackInternal,
      false,
    );
    assertStrictEquals(
      planBrainEngine(route("free-unapproved"), conns, modelRoutes, all).kind,
      "refused",
    );
    assertStrictEquals(
      planBrainEngine(route("free-nokey"), conns, modelRoutes, all).kind,
      "refused",
    );
  },
);

Deno.test(
  "the smart router uses approved free brains the user may pick, then Carmen",
  () => {
    const plan = planBrainEngine(smart, conns, modelRoutes, all);
    assertStrictEquals(plan.kind, "connections");
    if (plan.kind !== "connections") return;
    assertEquals(
      plan.connections.map((c) => c.id),
      ["free-a", "free-b"],
    );
    assertStrictEquals(plan.fallbackInternal, true);

    const noA = planBrainEngine(
      smart,
      conns,
      modelRoutes,
      (s) => s !== "free-a",
    );
    assertEquals(
      noA.kind === "connections" && noA.connections.map((c) => c.id),
      ["free-b"],
    );
    const noInternal = planBrainEngine(
      smart,
      conns,
      modelRoutes,
      (s) => s !== "internal",
    );
    assertStrictEquals(
      noInternal.kind === "connections" && noInternal.fallbackInternal,
      false,
    );
  },
);

Deno.test(
  "the smart router with no free brain falls back to Carmen, or refuses",
  () => {
    const paidOnly = [conns[0]];
    assertEquals(planBrainEngine(smart, paidOnly, modelRoutes, all), {
      kind: "internal",
    });
    assertStrictEquals(
      planBrainEngine(smart, paidOnly, modelRoutes, (s) => s !== "internal")
        .kind,
      "refused",
    );
  },
);
