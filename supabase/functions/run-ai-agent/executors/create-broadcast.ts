import type { CreateBroadcastArgs } from "./broadcast-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { TablesInsert } from "../../_shared/database.types.ts";

/** Preserves the existing create_broadcast executor and side-effect order. */
export async function executeCreateBroadcast(
  args: CreateBroadcastArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId } = context;

  // Build audience_filter from source + extra filter
  const audience_filter: TablesInsert<"broadcasts">["audience_filter"] = {
    source: args.audience_source,
    ...((args.audience_filter || {}) as Record<
      string,
      import("../../_shared/database.types.ts").Json
    >),
  };
  // Determine provider from tenant's default WA integration
  let provider = "green_api";
  let integration_id = args.integration_id || null;
  if (!integration_id) {
    const { data: integ } = await supabase
      .from("tenant_integrations")
      .select("id, integration_type")
      .eq("tenant_id", tenantId)
      .in("integration_type", ["green_api", "manus_wa"])
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (integ) {
      integration_id = integ.id;
      provider = integ.integration_type;
    }
  } else {
    const { data: integ } = await supabase
      .from("tenant_integrations")
      .select("integration_type")
      .eq("id", integration_id)
      .maybeSingle();
    if (integ) {
      provider = integ.integration_type;
    }
  }
  const insertData: TablesInsert<"broadcasts"> = {
    tenant_id: tenantId,
    created_by: userId && userId !== "system" ? userId : null,
    name: args.name,
    channel: "whatsapp",
    provider,
    integration_id,
    body_text: args.body_text,
    audience_filter,
    status: "draft",
  };
  if (args.scheduled_at) {
    insertData.scheduled_at = args.scheduled_at;
    insertData.status = "scheduled";
  }
  const { data: bc, error } = await supabase
    .from("broadcasts")
    .insert(insertData)
    .select("id, name, status, scheduled_at")
    .single();
  if (error) {
    throw error;
  }
  return {
    pending_approval: true,
    approval_id: null,
    broadcast_id: bc.id,
    summary: `דיוור חדש "${bc.name}" נוצר (${bc.status}). קהל: ${args.audience_source}. ${args.scheduled_at ? "מתוזמן ל-" + args.scheduled_at : "טרם נשלח — שאל את המשתמש לאישור ושליחה."}`,
    instruction_for_carmen:
      'הצג סיכום של הדיוור (שם, קהל, תוכן) ושאל "לשלוח עכשיו או לתזמן למועד מסוים?". אסור לשלוח בלי אישור מפורש.',
  };
}
