import type { UpdateClientHealthArgs } from "./pulse-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { setClientMoodStatus } from "../client-health-status.ts";
import { recordHealthCardEntryAfterUpdate } from "../carmen-client-card-tools.ts";

/** Preserves the existing update_client_health executor and side-effect order. */
export async function executeUpdateClientHealth(
  args: UpdateClientHealthArgs,
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

  await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  // Resolve an actor user for audit/update visibility even in background "system" runs
  let effectiveUserId = userId !== "system" ? userId : null;
  if (!effectiveUserId) {
    const { data: ownerRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("tenant_id", accessibleTenantIds)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    effectiveUserId = ownerRole?.user_id || null;
  }

  // 1. Update mood_status on client
  await setClientMoodStatus(supabase, {
    tenantId,
    clientId: args.client_id,
    moodStatus: args.mood_status,
  });

  // 2. Create communication_log entry
  const commStatus =
    args.communication_status ||
    (args.mood_status === "happy"
      ? "normal"
      : args.mood_status === "wavering"
        ? "sensitive"
        : "complaint");
  const { error: logErr } = await supabase.from("communication_logs").insert({
    client_id: args.client_id,
    tenant_id: tenantId,
    status: commStatus,
    interaction_type: "system_alert",
    note: args.note,
    updated_by: effectiveUserId,
  });
  if (logErr) {
    throw logErr;
  }

  // 3. Card entry as source carmen, so it never counts as client contact.
  const cardEntry = await recordHealthCardEntryAfterUpdate(supabase, {
    tenantId,
    clientId: args.client_id,
    note: args.note,
    moodStatus: args.mood_status,
    requesterUserId: humanRequesterUserId,
    tool: "update_client_health",
  });

  return {
    success: true,
    client_id: args.client_id,
    mood_status: args.mood_status,
    communication_status: commStatus,
    user_id: effectiveUserId,
    ...cardEntry,
  };
}
