import type { BatchUpdateClientHealthArgs } from "./pulse-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { RETENTION_BATCH_LIMIT } from "../../_shared/client-retention.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { setClientMoodStatus } from "../client-health-status.ts";
import { recordHealthCardEntryAfterUpdate } from "../carmen-client-card-tools.ts";

/** Preserves the existing batch_update_client_health executor and side-effect order. */
export async function executeBatchUpdateClientHealth(
  args: BatchUpdateClientHealthArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    userId,
    humanRequesterUserId,
    accessibleTenantIds,
    callerScope,
  } = context;

  const updates = Array.isArray(args.updates) ? args.updates : [];
  if (!updates.length) {
    throw new Error("נדרשת רשימת עדכונים");
  }
  if (updates.length > RETENTION_BATCH_LIMIT) {
    throw new Error(`אפשר לעדכן עד ${RETENTION_BATCH_LIMIT} לקוחות בקריאה אחת`);
  }
  let batchUserId = userId !== "system" ? userId : null;
  if (!batchUserId) {
    const { data: ownerRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("tenant_id", accessibleTenantIds)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    batchUserId = ownerRole?.user_id || null;
  }
  const results: Array<{
    client_id: string | null;
    success: boolean;
    mood_status?: string;
    card_entry_error?: unknown;
    error?: unknown;
  }> = [];
  for (const update of updates) {
    const clientId = update?.client_id;
    const mood = update?.mood_status;
    const note = typeof update?.note === "string" ? update.note.trim() : "";
    if (!clientId || !mood || !note) {
      results.push({
        client_id: clientId || null,
        success: false,
        error: "חסר client_id, mood_status או note",
      });
      continue;
    }
    if (!["happy", "wavering", "churn_risk"].includes(mood)) {
      results.push({
        client_id: clientId,
        success: false,
        error: "mood_status לא חוקי",
      });
      continue;
    }
    try {
      await assertCallerCanAccessClient(supabase, clientId, callerScope);
      await setClientMoodStatus(supabase, {
        tenantId,
        clientId,
        moodStatus: mood,
      });
      const commStatus =
        update.communication_status ||
        (mood === "happy"
          ? "normal"
          : mood === "wavering"
            ? "sensitive"
            : "complaint");
      const { error: logErr } = await supabase
        .from("communication_logs")
        .insert({
          client_id: clientId,
          tenant_id: tenantId,
          status: commStatus,
          interaction_type: "system_alert",
          note,
          updated_by: batchUserId,
        });
      if (logErr) {
        throw logErr;
      }
      const cardEntry = await recordHealthCardEntryAfterUpdate(supabase, {
        tenantId,
        clientId,
        note,
        moodStatus: mood,
        requesterUserId: humanRequesterUserId,
        tool: "batch_update_client_health",
      });
      results.push({
        client_id: clientId,
        success: true,
        mood_status: mood,
        ...cardEntry,
      });
    } catch (err) {
      results.push({
        client_id: clientId,
        success: false,
        error:
          (err as { message?: unknown } | null)?.message || "update failed",
      });
    }
  }
  const updated = results.filter((row) => row.success).length;
  return {
    success: updated === results.length,
    updated,
    failed: results.length - updated,
    outbound_sent: false,
    results,
    instructions_to_agent:
      "דווחי כמה עודכנו וכמה נכשלו. אסור לומר שנשלחה הודעה ללקוח.",
  };
}
