import type { CreateTaskArgs } from "./task-creation.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { tryCreateCalendarEventForTask } from "./task-calendar.ts";

/** Preserves the existing create_task executor and side-effect order. */
export async function executeCreateTask(
  args: CreateTaskArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    userId,
    callerCampaignerId,
    accessibleTenantIds,
  } = context;

  let campaignerId: string | null | undefined = args.campaigner_id;
  let agencyId = null;
  // Priority: 1) explicit arg, 2) caller identity (from WhatsApp phone), 3) user profile, 4) tenant owner
  if (!campaignerId && callerCampaignerId) {
    campaignerId = callerCampaignerId;
  }
  if (!campaignerId && userId && userId !== "system") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("campaigner_id")
      .eq("id", userId)
      .single();
    campaignerId = profile?.campaigner_id;
  }
  // Fallback for system/WhatsApp without phone match: assign to tenant owner
  if (!campaignerId) {
    const { data: ownerRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    if (ownerRole?.user_id) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("campaigner_id")
        .eq("id", ownerRole.user_id)
        .maybeSingle();
      campaignerId = ownerProfile?.campaigner_id;
    }
  }
  // A task for a client belongs to that client's agency — the campaigner's
  // own agency would file it under the wrong one on the tasks board.
  if (args.client_id) {
    const { data: taskClient } = await supabase
      .from("clients")
      .select("agency_id")
      .eq("id", args.client_id)
      .maybeSingle();
    agencyId = taskClient?.agency_id || null;
  }
  if (!agencyId && campaignerId) {
    const { data: campAgency } = await supabase
      .from("campaigner_agencies")
      .select("agency_id")
      .eq("campaigner_id", campaignerId)
      .limit(1)
      .single();
    agencyId = campAgency?.agency_id;
  }
  if (!agencyId) {
    const { data: defaultAgency } = await supabase
      .from("agencies")
      .select("id")
      .in("tenant_id", accessibleTenantIds)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    if (defaultAgency) {
      agencyId = defaultAgency.id;
    } else {
      const { data: fallbackAgency } = await supabase
        .from("agencies")
        .select("id")
        .in("tenant_id", accessibleTenantIds)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      agencyId = fallbackAgency?.id;
    }
  }
  // The authenticated/WhatsApp caller is the person who gave the task.
  // Service-role inserts do not receive the tasks.created_by auth.uid()
  // default, so persist it explicitly for attribution and notifications.
  const taskCreatorId = userId && userId !== "system" ? userId : null;
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: args.title,
      // The existing call lets the database reject an unresolved agency.
      agency_id: agencyId as string,
      campaigner_id: campaignerId,
      tenant_id: tenantId,
      priority: args.priority || 5,
      status: "open",
      task_type: "other",
      client_id: args.client_id || null,
      lead_id: args.lead_id || null,
      due_date: args.due_date,
      due_time: args.due_time,
      notes: args.notes,
      duration_minutes: args.duration_minutes || null,
      created_by: taskCreatorId,
    })
    .select("id, title, status")
    .single();
  if (error) {
    throw error;
  }
  // Auto-sync to Google Calendar — fire-and-forget; never fails the create_task call
  if (data?.id && args.due_date && args.due_time && campaignerId) {
    tryCreateCalendarEventForTask(
      supabase,
      data.id,
      args.title,
      args.due_date,
      args.due_time,
      args.duration_minutes ?? null,
      campaignerId,
    ).catch((e) =>
      console.warn("[create_task] calendar sync uncaught:", e?.message),
    );
  }
  return { task_id: data.id, title: data.title, status: data.status };
}
