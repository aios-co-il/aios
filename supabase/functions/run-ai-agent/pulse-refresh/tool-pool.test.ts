import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { REFRESH_CAMPAIGN_PULSE_TOOL } from "./tool.ts";
import { keepPulseRefreshTool } from "./tool-pool.ts";

const LATEST = { name: "get_latest_campaign_pulse" };
const ANALYZE = { name: "analyze_campaign_performance" };
const ALL_TOOLS = [LATEST, ANALYZE, REFRESH_CAMPAIGN_PULSE_TOOL];

/** An agent whose allowed_tools predates refresh_campaign_pulse. */
const narrowPool = () =>
  ALL_TOOLS.filter((t) => ["get_latest_campaign_pulse"].includes(t.name));

const names = (tools: { name: string }[]) => tools.map((t) => t.name);

Deno.test("keepPulseRefreshTool", async (t) => {
  await t.step(
    "Carmen keeps the refresh tool when allowed_tools omits it",
    () => {
      const pool = keepPulseRefreshTool(narrowPool(), ALL_TOOLS, {
        isCarmen: true,
        disabledTools: [],
      });
      assertEquals(names(pool), [
        "get_latest_campaign_pulse",
        "refresh_campaign_pulse",
      ]);
      assertStrictEquals(pool[1], REFRESH_CAMPAIGN_PULSE_TOOL);
    },
  );

  await t.step("disabled_tools still turns the refresh tool off", () => {
    const pool = narrowPool();
    assertStrictEquals(
      keepPulseRefreshTool(pool, ALL_TOOLS, {
        isCarmen: true,
        disabledTools: ["refresh_campaign_pulse"],
      }),
      pool,
    );
  });

  await t.step("other agents keep their allowed_tools as is", () => {
    const pool = narrowPool();
    assertStrictEquals(
      keepPulseRefreshTool(pool, ALL_TOOLS, {
        isCarmen: false,
        disabledTools: [],
      }),
      pool,
    );
  });

  await t.step("a pool that already offers the tool is unchanged", () => {
    assertStrictEquals(
      keepPulseRefreshTool(ALL_TOOLS, ALL_TOOLS, {
        isCarmen: true,
        disabledTools: [],
      }),
      ALL_TOOLS,
    );
  });
});
