import type { UpdateTaskArgs } from "./task-mutations.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessEntityClient } from "../../_shared/auth-helpers.ts";
import type { TablesUpdate } from "../../_shared/database.types.ts";
import { mapHumanTaskStatus } from "./task-status.ts";
import { tryCreateCalendarEventForTask } from "./task-calendar.ts";

/** Preserves the existing update_task executor and side-effect order. */
export async function executeUpdateTask(
  args: UpdateTaskArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;

  await assertCallerCanAccessEntityClient(
    supabase,
    "tasks",
    args.task_id,
    callerScope,
  );
  const { data: before } = await supabase
    .from("tasks")
    .select(
      "id, title, due_date, due_time, duration_minutes, campaigner_id, google_calendar_event_id",
    )
    .eq("id", args.task_id)
    .in("tenant_id", accessibleTenantIds)
    .maybeSingle();
  const updates: TablesUpdate<"tasks"> = {};
  if (args.title) {
    updates.title = args.title;
  }
  if (args.due_date !== undefined) {
    updates.due_date = args.due_date;
  }
  if (args.due_time !== undefined) {
    updates.due_time = args.due_time;
  }
  if (args.priority !== undefined) {
    updates.priority = args.priority;
  }
  if (args.notes !== undefined) {
    updates.notes = args.notes;
  }
  if (args.client_id !== undefined) {
    updates.client_id = args.client_id;
    // Keep the agency stamp on the client the task now belongs to.
    if (args.client_id) {
      const { data: movedClient } = await supabase
        .from("clients")
        .select("agency_id")
        .eq("id", args.client_id)
        .maybeSingle();
      if (movedClient?.agency_id) {
        updates.agency_id = movedClient.agency_id;
      }
    }
  }
  if (args.lead_id !== undefined) {
    updates.lead_id = args.lead_id;
  }
  if (args.campaigner_id !== undefined) {
    updates.campaigner_id = args.campaigner_id;
  }
  if (args.duration_minutes !== undefined) {
    updates.duration_minutes = args.duration_minutes;
  }
  if (args.status) {
    updates.status = mapHumanTaskStatus(args.status);
  }
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", args.task_id)
    .in("tenant_id", accessibleTenantIds)
    .select(
      "id, title, status, due_date, due_time, campaigner_id, google_calendar_event_id, duration_minutes",
    )
    .single();
  if (error) {
    throw error;
  }

  // Sync Google Calendar when schedule fields change
  const dateChanged =
    args.due_date !== undefined || args.due_time !== undefined;
  if (dateChanged && data) {
    const dueDate = data.due_date;
    const dueTime = data.due_time;
    const campaignerId = data.campaigner_id;
    if (dueDate && dueTime && campaignerId && !data.google_calendar_event_id) {
      tryCreateCalendarEventForTask(
        supabase,
        data.id,
        data.title,
        dueDate,
        dueTime,
        data.duration_minutes,
        campaignerId,
      ).catch(() => {});
    } else if (
      dueDate &&
      dueTime &&
      data.google_calendar_event_id &&
      campaignerId
    ) {
      // Best-effort PATCH of existing calendar event via helper path (recreate if patch unavailable)
      try {
        await tryCreateCalendarEventForTask(
          supabase,
          data.id,
          args.title || data.title || before?.title || "משימה",
          dueDate,
          dueTime,
          data.duration_minutes,
          campaignerId,
        );
      } catch {
        /* non-fatal */
      }
    }
  }
  return data;
}
