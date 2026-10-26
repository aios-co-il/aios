import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  withReservedBudget,
  type AtomicBudgetStore,
} from "./budget-reservation.ts";

Deno.test("paid call never starts on denied reservation", async () => {
  let called = false;
  const store: AtomicBudgetStore = {
    reserve: async () => ({ ok: false, reason: "insufficient_budget" }),
    settle: async () => {
      throw Error("unexpected settlement");
    },
  };
  const decision = await withReservedBudget(
    store,
    { tenantId: "t", requestId: "r", modelId: "paid", estimateUsd: 0.5 },
    async () => {
      called = true;
      return { result: "unreachable", actualCostUsd: 0.1 };
    },
  );
  assertStrictEquals(called, false);
  assertEquals(decision, { ok: false, reason: "budget_denied" });
});

Deno.test(
  "cost is reserved and settled without overrunning reservation",
  async () => {
    const settled: number[] = [];
    const store: AtomicBudgetStore = {
      reserve: async (input) => ({
        ok: true,
        lease: {
          reservationId: "res",
          tenantId: input.tenantId,
          requestId: input.requestId,
          modelId: input.modelId,
          reservedUsd: input.estimateUsd,
        },
      }),
      settle: async ({ actualCostUsd }) => {
        settled.push(actualCostUsd);
      },
    };
    const decision = await withReservedBudget(
      store,
      { tenantId: "t", requestId: "r", modelId: "paid", estimateUsd: 0.5 },
      async () => ({ result: "ok", actualCostUsd: 0.2 }),
    );
    assertEquals(decision, { ok: true, value: "ok" });
    assertEquals(settled, [0.2]);
  },
);

Deno.test(
  "provider errors retain whole reservation to avoid silent overspend",
  async () => {
    let charged = 0;
    const store: AtomicBudgetStore = {
      reserve: async () => ({
        ok: true,
        lease: {
          reservationId: "res",
          tenantId: "t",
          requestId: "r",
          modelId: "paid",
          reservedUsd: 0.5,
        },
      }),
      settle: async ({ actualCostUsd }) => {
        charged = actualCostUsd;
      },
    };
    await assertRejects(
      () =>
        withReservedBudget(
          store,
          { tenantId: "t", requestId: "r", modelId: "paid", estimateUsd: 0.5 },
          async () => {
            throw Error("timeout");
          },
        ),
      Error,
      "timeout",
    );
    assertStrictEquals(charged, 0.5);
  },
);

Deno.test("invalid price blocks inference before reserving", async () => {
  let called = false;
  const store: AtomicBudgetStore = {
    reserve: async () => {
      called = true;
      throw Error("not allowed");
    },
    settle: async () => {},
  };
  const result = await withReservedBudget(
    store,
    { tenantId: "t", requestId: "r", modelId: "paid", estimateUsd: null },
    async () => ({ result: "ok", actualCostUsd: 0 }),
  );
  assertStrictEquals(called, false);
  assertStrictEquals(result.ok, false);
});
