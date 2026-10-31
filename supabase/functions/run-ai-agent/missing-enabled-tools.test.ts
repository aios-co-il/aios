import { assertEquals } from "jsr:@std/assert@1";
import { missingEnabledTools } from "./missing-enabled-tools.ts";

const ALL_TOOLS = [
  { name: "list_leads" },
  { name: "get_latest_campaign_pulse" },
  { name: "refresh_campaign_pulse" },
  { name: "analyze_campaign_performance" },
];

const names = (tools: { name: string }[]) => tools.map((t) => t.name);

Deno.test("missingEnabledTools", async (t) => {
  await t.step("adds the named tools the pool lacks, in catalog order", () => {
    const added = missingEnabledTools(
      [{ name: "list_leads" }],
      ALL_TOOLS,
      ["analyze_campaign_performance", "get_latest_campaign_pulse"],
      [],
    );
    assertEquals(names(added), [
      "get_latest_campaign_pulse",
      "analyze_campaign_performance",
    ]);
  });

  await t.step("skips tools already in the pool", () => {
    const added = missingEnabledTools(
      [{ name: "get_latest_campaign_pulse" }],
      ALL_TOOLS,
      new Set(["get_latest_campaign_pulse"]),
      [],
    );
    assertEquals(added, []);
  });

  await t.step("disabled_tools wins over the request", () => {
    const added = missingEnabledTools(
      [],
      ALL_TOOLS,
      ["get_latest_campaign_pulse", "refresh_campaign_pulse"],
      ["refresh_campaign_pulse"],
    );
    assertEquals(names(added), ["get_latest_campaign_pulse"]);
  });

  await t.step("names missing from the catalog add nothing", () => {
    assertEquals(missingEnabledTools([], ALL_TOOLS, ["no_such_tool"], []), []);
  });
});
