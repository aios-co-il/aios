import { canSetMarketTarget } from "../../pulse/targets/market-guard.ts";
import {
  pulseTargetKindLabel,
  pulseTargetSourceLabel,
} from "../../pulse/targets/kinds.ts";
import type { PulseTargetDb, PulseTargetToolContext } from "./context.ts";
import { roleProblem } from "./context.ts";
import { marketRangeProblem } from "./market-range.ts";
import { parseTargetInput, type TargetInput } from "./parse-target-input.ts";
import {
  loadPlatformTables,
  noCampaignTable,
  type PlatformTable,
} from "./platform-tables.ts";
import {
  campaignProblem,
  campaignReadTables,
  latestCampaignRows,
  matchCampaign,
  type PulseCampaignMatch,
} from "./snapshot-rows.ts";
import { writeMarketTarget } from "./write-market-target.ts";

/**
 * set_market_target: Carmen writes her own market estimate ("יעד שוק (כרמן)")
 * where no approved target applies. It alerts like an approved one; she never
 * overwrites a target a person approved.
 */
export async function setMarketTarget(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  args: Record<string, unknown>,
) {
  const parsed = parseTargetInput(args);
  if ("error" in parsed) {
    return parsed;
  }
  const rationale = String(args.rationale ?? "").trim();
  if (!statesNumbers(rationale)) {
    return {
      error: "rationale_required",
      message:
        "נימוק חסר או קצר מדי: ציינו את הבנצ׳מרק של הענף בישראל ואת ההיסטוריה של הלקוח, עם מספרים.",
    };
  }
  const role = roleProblem(ctx);
  if (role) {
    return { success: false, ...role };
  }
  await ctx.assertClientAccess(parsed.clientId);
  const tables = await loadPlatformTables(db, ctx, parsed);
  if (!tables.length) {
    return noCampaignTable();
  }
  const rows = await latestCampaignRows(db, ctx, [parsed.clientId]);
  const campaign = matchCampaign(rows, parsed);
  const problem = campaignProblem(parsed, campaign);
  if (problem) {
    return { success: false, ...problem };
  }
  // The pulse resolved the campaign's target over every table it is read from.
  if (campaign?.targetSource === "approved") {
    return approvedTargetRefusal({
      value: campaign.targetValue,
      kind: campaign.targetKind,
      source: "approved",
      scope: campaign.targetScope,
    });
  }
  const targetTables = tablesToWrite(tables, campaign);
  const block = findApprovedTargetBlock(tables, targetTables, campaign, parsed);
  if (block) {
    return block;
  }
  const outOfRange = marketRangeProblem(rows, parsed);
  if (outOfRange) {
    return outOfRange;
  }
  const written = await writeMarketTarget(db, ctx, {
    input: parsed,
    rationale,
    campaign,
    tables: targetTables,
  });
  if (!written.ok) {
    // The tables written before the failure were restored; still_written names
    // any whose restore failed too.
    return {
      success: false,
      error: written.error,
      still_written: written.stillWritten,
    };
  }
  return {
    success: true,
    source: "carmen_market",
    label: pulseTargetSourceLabel("carmen_market"),
    target: `${pulseTargetKindLabel(parsed.kind)} ${parsed.value}`,
    scope: campaign ? "campaign" : "platform",
    campaign: campaign?.campaignName || campaign?.campaignId || null,
    written: written.written,
    set_at: written.setAt,
    note: "מרענון הדופק הבא חריגה מתמשכת מהיעד תתריע כמו יעד מאושר, וההתראה תציין שזה יעד שוק של כרמן. אדם יכול להחליף אותו ביעד מאושר בדשבורד הדופק.",
  };
}

/** Both sources must be stated with numbers; a bare opinion is not a market target. */
function statesNumbers(rationale: string): boolean {
  return rationale.length >= MIN_RATIONALE_CHARS && /\d/.test(rationale);
}

const MIN_RATIONALE_CHARS = 30;

/**
 * A campaign target goes to the table the pulse reads that campaign from (to
 * every table when that one is no longer connected); a platform target to every
 * table.
 */
function tablesToWrite(
  tables: PlatformTable[],
  campaign: PulseCampaignMatch | null,
): PlatformTable[] {
  const sampled = campaign?.tableId;
  return sampled && tables.some((t) => t.id === sampled)
    ? tables.filter((t) => t.id === sampled)
    : tables;
}

/**
 * The refusal when an approved target applies on any table checked: a campaign is
 * checked on the tables the pulse reads it from and on every table it is written
 * to, a platform target on every table of this client × platform. Nothing is
 * written unless every one allows it.
 */
function findApprovedTargetBlock(
  tables: PlatformTable[],
  targetTables: PlatformTable[],
  campaign: PulseCampaignMatch | null,
  input: TargetInput,
) {
  const ref = campaign
    ? { campaignId: campaign.campaignId, campaignName: campaign.campaignName }
    : null;
  const readTables = campaign ? campaignReadTables(tables, campaign) : tables;
  const checkedTables = tables.filter(
    (table) => readTables.includes(table) || targetTables.includes(table),
  );
  for (const table of checkedTables) {
    const allowed = canSetMarketTarget(
      table.integration_settings || {},
      input.goal,
      ref,
    );
    if (allowed.ok) {
      continue;
    }
    return allowed.reason === "approved_target_exists"
      ? { ...approvedTargetRefusal(allowed.existing), table_id: table.id }
      : {
          success: false,
          error: allowed.reason || "not_written",
          message: "היעד לא נשמר",
        };
  }
  return null;
}

/** Carmen never overwrites a person's target; she offers set_pulse_target instead. */
function approvedTargetRefusal(existing: unknown) {
  return {
    success: false,
    error: "approved_target_exists",
    existing,
    message:
      "כבר יש יעד מאושר שאדם קבע — כרמן לא דורסת אותו. אם צריך לשנות, הציעי למשתמש set_pulse_target (באישור).",
  };
}
