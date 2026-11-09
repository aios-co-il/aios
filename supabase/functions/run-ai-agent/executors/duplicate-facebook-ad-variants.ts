import { loadDuplicateAdSource } from "./duplicate-ad-source.ts";
import {
  findPendingAdDuplicate,
  type NormalizedAdVariant,
} from "./pending-ad-duplicate.ts";
import type { DuplicateFacebookAdVariantsArgs } from "./meta-campaign-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { normalizeAdCopyVariants } from "../../_shared/fb-ad-duplicate.ts";

/** Preserves the existing duplicate_facebook_ad_variants executor and side-effect order. */
export async function executeDuplicateFacebookAdVariants(
  args: DuplicateFacebookAdVariantsArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    agentId,
    callerRole,
    callerPhone,
    actorUserId,
    callerScope,
  } = context;

  await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  if (!args.source_ad_id) {
    return { error: "source_ad_id_required" };
  }
  let variants: Array<NormalizedAdVariant>;
  try {
    variants = normalizeAdCopyVariants(args);
  } catch (e) {
    return { error: String((e as { message?: unknown } | null)?.message || e) };
  }
  // Prefetch source summary for the approval card (read-only; no mutation yet).
  const sourceResult = await loadDuplicateAdSource(args, context);
  if ("failure" in sourceResult) {
    return sourceResult.failure;
  }
  const { source } = sourceResult;
  const toolInput = {
    client_id: args.client_id,
    source_ad_id: args.source_ad_id,
    count: variants.length,
    variants,
    daily_budget:
      args.daily_budget != null ? Number(args.daily_budget) : undefined,
    budget_level: args.budget_level === "adset" ? "adset" : "campaign",
    status: args.status === "ACTIVE" ? "ACTIVE" : "PAUSED",
  };
  const budgetNote =
    toolInput.daily_budget != null
      ? ` + תקציב ₪${toolInput.daily_budget}/יום ברמת ${toolInput.budget_level}`
      : "";
  const title = `שכפול מודעה FB ×${variants.length}: ${source.ad_name || args.source_ad_id}${budgetNote}`;
  const variant_previews = variants.map((v, i: number) => ({
    i: i + 1,
    name: v.name || `${source.ad_name || "Ad"} · v${i + 1}`,
    primary_text: v.primary_text,
    headline: v.headline,
  }));
  // Avoid approval loops: reuse an existing pending duplicate for the same source ad.
  const reused = await findPendingAdDuplicate(
    supabase,
    tenantId,
    args.source_ad_id,
  );
  if (reused) {
    return {
      pending_approval: true,
      approval_id: reused.id,
      reused_existing: true,
      action: "fb_duplicate_ad_variants",
      summary: reused.title || title,
      source,
      variants_count: (reused.tool_input?.variants || variants).length,
      variant_previews: reused.context?.variant_previews || variant_previews,
      daily_budget:
        reused.tool_input?.daily_budget ?? toolInput.daily_budget ?? null,
      budget_level: reused.tool_input?.budget_level || toolInput.budget_level,
      new_ads_status: reused.tool_input?.status || toolInput.status,
      instruction_for_carmen:
        'כבר יש בקשת אישור פתוחה לאותו שכפול. הציגי את הסיכום הקיים ובקשי "לאשר? (כן/לא)" פעם אחת. אחרי כן — execute_pending_approval עם ה-approval_id הזה. אל תיצרי בקשה חדשה.',
    };
  }
  const { data: aqRow, error: aqErr } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: "fb_duplicate_ad_variants",
      title,
      description: `שכפול מודעה מנצחת עם וריאציות קופי באותו ad set — שומר page/media/lead form. מודעות חדשות: ${toolInput.status}.`,
      tool_name: "fb_duplicate_ad_variants",
      tool_input: toolInput,
      context: {
        caller_role: callerRole,
        caller_phone: callerPhone,
        client_id: args.client_id,
        source,
        variant_previews,
      },
      status: "pending",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (aqErr) {
    throw aqErr;
  }
  return {
    pending_approval: true,
    approval_id: aqRow.id,
    action: "fb_duplicate_ad_variants",
    summary: title,
    source,
    variants_count: variants.length,
    variant_previews: variants.map((v, i: number) => ({
      i: i + 1,
      primary_text: v.primary_text,
      headline: v.headline,
      name: v.name || null,
    })),
    daily_budget: toolInput.daily_budget ?? null,
    budget_level: toolInput.budget_level,
    new_ads_status: toolInput.status,
    instruction_for_carmen:
      'הציגי לדיוויד: מקור (שם מודעה + adset) + תקציר 4 הוריאציות + תקציב אם יש. בקשי אישור: "לאשר? (כן/לא)". רק אחרי כן — execute_pending_approval. אין מוטציה ב-Meta לפני אישור. אסור לטעון שבוצע בלי success מ-execute_pending_approval.',
  };
}
