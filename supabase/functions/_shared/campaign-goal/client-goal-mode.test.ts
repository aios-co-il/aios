import { assertStrictEquals } from "jsr:@std/assert@1";
import { clientGoalModeOf } from "./client-goal-mode.ts";
import type { ReportCampaignGoal } from "./report-goals.ts";

type Row = {
  table_id: string;
  goal?: ReportCampaignGoal;
  data: Record<string, unknown>;
};

const row = (
  table_id: string,
  goal: ReportCampaignGoal,
  date: string,
  spend: number,
): Row => ({ table_id, goal, data: { date, spend } });
const plainMeta = { id: "m", integration_type: "facebook_insights" };
const ecommerceTable = { id: "e", integration_type: "facebook_ecommerce" };
const googleSales = {
  id: "g",
  integration_type: "google_ads",
  integration_settings: { campaign_type: "ecommerce" },
};

/** The mode of `records` since 2026-10-07, as the pulse reads 30 days. */
function modeOf(records: Array<Row>, tables: Array<Record<string, unknown>>) {
  return clientGoalModeOf({
    records,
    goalOf: (record) => record.goal,
    tables,
    sinceYmd: "2026-10-07",
  });
}

Deno.test("clientGoalModeOf", async (t) => {
  await t.step(
    "a plain Meta table running a sales campaign is ecommerce, so its ROAS counts",
    () => {
      // Before AIO-494 the table's settings alone made this a leads client.
      assertStrictEquals(
        modeOf([row("m", "ecommerce", "2026-11-01", 100)], [plainMeta]),
        "ecommerce",
      );
    },
  );

  await t.step(
    "lead and sales campaigns that spent make a hybrid client",
    () => {
      assertStrictEquals(
        modeOf(
          [
            row("m", "leads", "2026-11-01", 50),
            row("m", "ecommerce", "2026-11-02", 80),
          ],
          [plainMeta],
        ),
        "hybrid",
      );
    },
  );

  await t.step(
    "an ecommerce table whose campaigns are all lead campaigns is leads",
    () => {
      assertStrictEquals(
        modeOf([row("e", "leads", "2026-11-01", 50)], [ecommerceTable]),
        "leads",
      );
    },
  );

  await t.step(
    "a sales table whose sync died keeps its goal, so its stale data still shows",
    () => {
      // Review finding: without this, a dead Google sales table beside a
      // spending lead table dropped the sales status and its stale flag.
      assertStrictEquals(
        modeOf([row("m", "leads", "2026-11-01", 50)], [plainMeta, googleSales]),
        "hybrid",
      );
    },
  );

  await t.step(
    "a sales table spending only on exposure campaigns keeps its own goal (AIO-496)",
    () => {
      assertStrictEquals(
        modeOf([row("g", "traffic", "2026-11-01", 40)], [googleSales]),
        "ecommerce",
      );
    },
  );

  await t.step(
    "rows without spend or before the window, and traffic, do not decide",
    () => {
      assertStrictEquals(
        modeOf(
          [
            row("m", "ecommerce", "2026-11-01", 0),
            row("m", "ecommerce", "2026-09-01", 100),
            row("m", "traffic", "2026-11-01", 100),
          ],
          [plainMeta],
        ),
        "leads",
      );
    },
  );

  await t.step(
    "with no campaign spend the active tables decide, a switched-off one not",
    () => {
      assertStrictEquals(modeOf([], [ecommerceTable]), "ecommerce");
      assertStrictEquals(modeOf([], [plainMeta, ecommerceTable]), "hybrid");
      assertStrictEquals(
        modeOf([], [{ ...ecommerceTable, campaign_active: false }]),
        "leads",
      );
    },
  );
});
