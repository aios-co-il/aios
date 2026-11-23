import { loadPulseCacheRows } from "./pulse-cache-rows.ts";
import { loadPulseManualOverrides } from "./pulse-manual-overrides.ts";
import { pulseTableLines } from "./pulse-table-lines.ts";
import type { GetLatestCampaignPulseArgs } from "./pulse-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { expandSnapshotsToGoalRows } from "../../_shared/campaign-pulse.ts";
import { buildPulseDashboardAbsoluteUrl } from "../../_shared/campaign-pulse.ts";
import { countPulseStatuses } from "../../_shared/campaign-pulse.ts";
import { pulseRowHasNoRecentClientCall } from "../../_shared/pulse/client-call.ts";
import { loadPulseCriticalIssues } from "./pulse-critical-issues.ts";
import { buildPulseWhatsAppDigest } from "../../_shared/campaign-pulse.ts";
import { pulseSurfacePrefersWhatsAppDigest } from "../../_shared/campaign-pulse.ts";

/** Preserves the existing get_latest_campaign_pulse executor and side-effect order. */
export async function executeGetLatestCampaignPulse(
  args: GetLatestCampaignPulseArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, surface, accessibleTenantIds } = context;

  const normalizedRows = await loadPulseCacheRows(args, context);
  const goalRows = expandSnapshotsToGoalRows(
    normalizedRows.map((row) => ({
      ...row,
      client_name: row.client_name,
      agency_name: row.agency_name,
    })),
  );
  const pulseClientIds = normalizedRows
    .map((row) => row.client_id)
    .filter(Boolean);
  const manualOverrides = await loadPulseManualOverrides(
    supabase,
    tenantId,
    pulseClientIds,
  );
  const tableLines = pulseTableLines(goalRows, normalizedRows);
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  const tenantSlug = tenantRow?.slug || tenantId;
  const dashboardUrl = buildPulseDashboardAbsoluteUrl(tenantSlug);
  const statusCounts = countPulseStatuses(goalRows);
  const noRecentClientCallCount = normalizedRows.filter(
    pulseRowHasNoRecentClientCall,
  ).length;
  const criticalIssues = await loadPulseCriticalIssues(
    supabase,
    accessibleTenantIds,
    normalizedRows,
  );
  const whatsappDigest = normalizedRows.length
    ? buildPulseWhatsAppDigest(normalizedRows, dashboardUrl, criticalIssues)
    : null;
  const preferDigest = pulseSurfacePrefersWhatsAppDigest(surface);
  if (!normalizedRows.length) {
    return {
      data_source: "deterministic_campaign_pulse_cache",
      external_api_called: false,
      ai_used_to_calculate: false,
      auto_refreshed: false,
      count: 0,
      freshness: null,
      status_counts: statusCounts,
      no_recent_client_call_count: 0,
      dashboard_url: dashboardUrl,
      whatsapp_digest: null,
      rows: preferDigest ? undefined : [],
      formatted_markdown: null,
      instructions_to_agent:
        "לא נמצא Snapshot שמור. אמרי שאין בדיקת דופק זמינה. אסור ליצור בדיקה חדשה, להריץ כלי חלופי או להמציא נתונים.",
    };
  }
  if (preferDigest) {
    // WhatsApp / agent-task: short digest only — never hand the model a full table to paste.
    return {
      data_source: "deterministic_campaign_pulse_cache",
      external_api_called: false,
      ai_used_to_calculate: false,
      auto_refreshed: false,
      count: goalRows.length,
      freshness: normalizedRows[0]?.calculated_at || null,
      status_counts: statusCounts,
      no_recent_client_call_count: noRecentClientCallCount,
      dashboard_url: dashboardUrl,
      whatsapp_digest: whatsappDigest,
      formatted_markdown: null,
      instructions_to_agent:
        'בוואטסאפ החזירי את whatsapp_digest כלשונו בלבד — כולל בלוק "🔴 דורש טיפול" כשיש ושורת הקישור לדשבורד. אסור טבלת Markdown, אסור פירוט לקוח-לקוח, אסור להדביק rows. אל תריצי כלי חי נוסף אלא אם המשתמש ביקש במפורש נתונים חיים/רענון או ניתוח עמוק ללקוח ספציפי.',
    };
  }
  return {
    data_source: "deterministic_campaign_pulse_cache",
    external_api_called: false,
    ai_used_to_calculate: false,
    auto_refreshed: false,
    count: normalizedRows.length,
    freshness: normalizedRows[0]?.calculated_at || null,
    status_counts: statusCounts,
    no_recent_client_call_count: noRecentClientCallCount,
    dashboard_url: dashboardUrl,
    whatsapp_digest: whatsappDigest,
    manual_overrides: manualOverrides,
    rows: normalizedRows,
    formatted_markdown: tableLines.join("\n"),
    instructions_to_agent:
      "status משקף ביצועי קמפיין ונתונים בלבד. היעדר שיחה מתועדת עם הלקוח מופיע בנפרד ב-no_recent_client_call וב-no_recent_client_call_count, ואינו הופך לקוח ל'תשומת לב'. בדשבורד הפנימי אפשר להציג את formatted_markdown. בוואטסאפ — רק whatsapp_digest (סיכום + קישור), בלי טבלה. אל תריצי כלי חי נוסף אלא אם המשתמש ביקש במפורש נתונים חיים/רענון או ניתוח עמוק. אם manual_overrides לא ריק — קראי את reason של כל תיקון ידני: זה feedback מקצועי על מתי האלגוריתם מגזים/מפחית. אל תתעלמי ממנו בדיונים על סיווג לקוחות; אל תשני snapshot בעצמך.",
  };
}
