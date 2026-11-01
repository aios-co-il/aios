import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../../budget.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import type { CollectorContext } from "../types.ts";
import { groupUpdateSources } from "./sources.ts";

/** A context over a recording client answering with `respond`. */
function context(
  dryRun: boolean,
  respond?: Parameters<typeof recordingClient>[0],
) {
  const { db, calls } = recordingClient(respond);
  const ctx: CollectorContext = {
    tenantId: "t1",
    settings: resolveManagerSettings(null),
    loadRules: () => Promise.resolve(null),
    now: new Date("2026-11-01T17:37:00Z"),
    since: new Date("2026-10-31T17:37:00Z"),
    watermark: null,
    budget: RoundBudget.create(60_000, 10),
    clientIds: null,
    db,
    fixtures: null,
    dryRun,
  };
  return { ctx, calls };
}

Deno.test("groupUpdateSources", async (t) => {
  await t.step("a preview never calls the model", () => {
    const { ctx, calls } = context(true);
    assertEquals(groupUpdateSources(ctx).summarize.ask, null);
    assertEquals(calls, []);
  });

  await t.step(
    "reads the chat collector's lines: a campaigner's own line included",
    async () => {
      const { ctx } = context(false, ({ path }) => {
        switch (path) {
          case "tenant_integrations":
            return [
              { user_id: "u-camp", connection_visibility: "private" },
              { user_id: "stranger", connection_visibility: "private" },
              { user_id: "office", connection_visibility: "org" },
            ];
          case "user_roles":
            return [{ user_id: "u-camp" }];
          default:
            return [];
        }
      });
      assertEquals(await groupUpdateSources(ctx).lines(), ["u-camp", "office"]);
    },
  );

  await t.step("a scheduled run asks the model with no spend read", () => {
    const { ctx, calls } = context(false);
    assertEquals(typeof groupUpdateSources(ctx).summarize.ask, "function");
    assertEquals(calls, []);
  });
});
