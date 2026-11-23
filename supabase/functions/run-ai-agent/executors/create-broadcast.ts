import type { Json } from "../../_shared/database.types.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { TablesInsert } from "../../_shared/database.types.ts";

/** Preserves the existing create_broadcast executor and side-effect order. */
export async function executeCreateBroadcast(
  args: CreateBroadcastArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId } = context;

  const filter = args.audience_filter;
  const audience_filter = {
    ...(filter && typeof filter === "object" && !Array.isArray(filter)
      ? filter
      : {}),
    source: args.audience_source,
  };
  // Determine provider from tenant's default WA integration
  let provider = "green_api";
  let integration_id = args.integration_id || null;
  if (!integration_id) {
    const { data: integ, error: integrationError } = await supabase
      .from("tenant_integrations")
      .select("id, integration_type")
      .eq("tenant_id", tenantId)
      .in("integration_type", ["green_api", "manus_wa"])
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (integrationError) {
      throw integrationError;
    }
    if (integ) {
      integration_id = integ.id;
      provider = integ.integration_type;
    }
  } else {
    const { data: integ, error: integrationError } = await supabase
      .from("tenant_integrations")
      .select("integration_type")
      .eq("id", integration_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (integrationError) {
      throw integrationError;
    }
    if (!integ) {
      throw new Error("אינטגרציה לא נמצאה");
    }
    provider = integ.integration_type;
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
    // Scheduling requires the separate human-approved schedule_broadcast action.
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
    pending_approval: false,
    approval_id: null,
    broadcast_id: bc.id,
    summary: `דיוור חדש "${bc.name}" נוצר (${bc.status}). קהל: ${args.audience_source}. טרם נשלח — שאל את המשתמש לאישור ושליחה או תזמון.`,
    instruction_for_carmen:
      'הצג סיכום של הדיוור (שם, קהל, תוכן) ושאל "לשלוח עכשיו או לתזמן למועד מסוים?". אסור לשלוח בלי אישור מפורש.',
  };
}

type CreateBroadcastArgs = {
  name: string;
  body_text: string;
  audience_source: "clients" | "leads" | "campaigners" | "wa_groups";
  audience_filter?: Json;
  scheduled_at?: string;
  integration_id?: string;
};
