import { pulsePlatformName } from "../../pulse/platforms.ts";
import { pulseTargetKindLabel } from "../../pulse/targets/kinds.ts";
import { resolvePulseTarget } from "../../pulse/targets/resolve.ts";
import type { PulseTargetDb, PulseTargetToolContext } from "./context.ts";
import { roleProblem } from "./context.ts";
import { parseTargetInput, type TargetInput } from "./parse-target-input.ts";
import { loadPlatformTables, noCampaignTable } from "./platform-tables.ts";
import {
  campaignProblem,
  GOAL_LABELS,
  latestCampaignRows,
  matchCampaign,
} from "./snapshot-rows.ts";
import {
  findPendingTargetRequest,
  queueTargetRequest,
  type TargetRequestInput,
} from "./target-request-queue.ts";

/**
 * set_pulse_target: an approved target for a human requester, queued in
 * agent_approval_queue. carmen-approval-execute writes it once the person says
 * yes; repeat calls reuse the open request.
 */
export async function requestApprovedTarget(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  args: Record<string, unknown>,
) {
  const requester = ctx.actorUserId;
  if (!requester) {
    return {
      error: "human_requester_required",
      message:
        "יעד מאושר נקבע רק לבקשת אדם. בלי מבקש — אפשר לקבוע יעד שוק (set_market_target).",
    };
  }
  const parsed = parseTargetInput(args);
  if ("error" in parsed) {
    return parsed;
  }
  const role = roleProblem(ctx);
  if (role) {
    return role;
  }
  await ctx.assertClientAccess(parsed.clientId);
  const tables = await loadPlatformTables(db, ctx, parsed);
  if (!tables.length) {
    return noCampaignTable();
  }
  const campaign = matchCampaign(
    await latestCampaignRows(db, ctx, [parsed.clientId]),
    parsed,
  );
  const problem = campaignProblem(parsed, campaign);
  if (problem) {
    return problem;
  }
  const tableIds =
    campaign?.tableId && tables.some((t) => t.id === campaign.tableId)
      ? [campaign.tableId]
      : tables.map((t) => t.id);
  const ref = campaign
    ? { campaignId: campaign.campaignId, campaignName: campaign.campaignName }
    : null;
  const previous = tables
    .filter((t) => tableIds.includes(t.id))
    .map((t) => ({
      table_id: t.id,
      target: resolvePulseTarget(
        t.integration_settings || {},
        parsed.goal,
        ref,
      ),
    }));
  const name = await clientName(db, ctx, parsed.clientId);
  const where = campaign
    ? `קמפיין ${campaign.campaignName || campaign.campaignId}`
    : `כל קמפייני ה${GOAL_LABELS.get(parsed.goal)}`;
  const title = `יעד ${pulseTargetKindLabel(parsed.kind)} ${parsed.value} ל${name} (${pulsePlatformName(parsed.platform)}, ${where})`;
  const toolInput: TargetRequestInput = {
    client_id: parsed.clientId,
    platform: parsed.platform,
    goal: parsed.goal,
    kind: parsed.kind,
    value: parsed.value,
    campaign_id: campaign?.campaignId ?? null,
    campaign_name: campaign?.campaignName ?? null,
    table_ids: tableIds,
    note: String(args.note ?? "").trim() || null,
  };
  const reused = await findPendingTargetRequest(db, ctx, requester, toolInput);
  if (reused) {
    return {
      pending_approval: true,
      approval_id: reused.id,
      reused_existing: true,
      action: "set_pulse_target",
      summary: reused.title || title,
      instruction_for_carmen:
        'כבר יש בקשת אישור פתוחה לאותו יעד. הציגי אותה ובקשי "לאשר? (כן/לא)" פעם אחת; אחרי כן — execute_pending_approval עם ה־approval_id הזה.',
    };
  }
  const approvalId = await queueTargetRequest(db, ctx, requester, {
    title,
    toolInput,
    context: {
      caller_role: ctx.callerRole,
      caller_phone: ctx.callerPhone,
      client_name: name,
      previous,
    },
  });
  return {
    pending_approval: true,
    approval_id: approvalId,
    action: "set_pulse_target",
    summary: title,
    previous,
    instruction_for_carmen:
      'הציגי את היעד החדש (ואת הקודם אם יש) ובקשי אישור: "לאשר? (כן/לא)". אל תבצעי עד execute_pending_approval אחרי תשובה חיובית.',
  };
}

/** The client's name for the approval title, read in the caller's tenants. */
async function clientName(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  clientId: TargetInput["clientId"],
): Promise<string> {
  const { data, error } = await db
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .in("tenant_id", ctx.accessibleTenantIds)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.name || "לקוח";
}
