import type { TablesInsert } from "../../_shared/database.types.ts";
import type { CreateAgentTaskArgs } from "./task-creation.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_agent_task executor and side-effect order. */
export async function executeCreateAgentTask(
  args: CreateAgentTaskArgs,
  context: ToolExecutionContext,
) {
  const { waNotify, supabase, tenantId, agentId, callerPhone, actorUserId } =
    context;

  // Create task in agent_tasks table (for Carmen herself)
  // If this looks like a reminder and we know the caller's WhatsApp phone,
  // inject explicit reminder-delivery instructions so when the dispatcher
  // fires the task, the agent knows where to send the reminder.
  const skillsArr: Array<string> = Array.isArray(args.task_skills)
    ? args.task_skills
    : [];
  const titleStr = String(args.title || "");
  const descStr = String(args.description || "");
  const looksLikeReminder =
    skillsArr.includes("reminder") ||
    /תזכור|reminder|להזכיר|תזכר/i.test(titleStr + " " + descStr);
  const { buildCampaignShutdownJobFromBrief } =
    await import("../../_shared/client-campaign-shutdown.ts");
  const shutdownJob = buildCampaignShutdownJobFromBrief(titleStr, descStr);
  let finalDescription = descStr || null;
  if (looksLikeReminder && callerPhone) {
    const reminderText = descStr || titleStr;
    const instruction = `\n\n[הוראת ביצוע אוטומטית לזמן ההפעלה]\nכשמשימה זו רצה, חובה לשלוח עכשיו הודעת WhatsApp תזכורת לטלפון ${callerPhone} עם הטקסט בעברית, בקצרה ובחום:\n"${reminderText}"\nהשתמשי בכלי send_whatsapp_via_gateway (אם יש integrationId זמין) או send_message (אם phone=${callerPhone} שייך ל-lead/client). אם אף כלי לא זמין — השתמשי בכל כלי WhatsApp אחר שיש לך. אסור לסיים את המשימה בלי לשלוח בפועל. אל תיצרי משימת agent חדשה.`;
    finalDescription = (descStr ? descStr : titleStr) + instruction;
  }
  const taskData: TablesInsert<"agent_tasks"> = {
    // Preserve database rejection when neither caller nor args supplies an agent.
    agent_id: (agentId || args.agent_id) as string,
    tenant_id: tenantId,
    title: args.title,
    description: finalDescription,
    priority: args.priority || 5,
    status: "pending",
    schedule_type: args.schedule_type || "once",
    scheduled_at: args.scheduled_at || null,
    cron_expression: args.cron_expression || null,
    task_skills: args.task_skills ? JSON.stringify(args.task_skills) : null,
    task_mode: "agent",
    enabled: true,
    created_by: actorUserId,
    // WhatsApp reminders must retain the exact originating destination.
    // run-agent-task consumes this metadata deterministically at execution
    // time, so a group reminder is sent back to the group rather than
    // asking the model to infer a recipient (or create another reminder).
    result: (() => {
      if (looksLikeReminder && waNotify) {
        return {
          notify: waNotify,
          reminder_delivery: { message: descStr || titleStr },
        };
      }
      if (shutdownJob) {
        return {
          campaign_shutdown_job: {
            ...shutdownJob,
            scope: shutdownJob.scope ?? { mode: "all_client_campaigns" },
            notify_david: shutdownJob.notify_david !== false,
          },
        };
      }
      return null;
    })(),
  };
  const { data, error } = await supabase
    .from("agent_tasks")
    .insert(taskData)
    .select("id, title, status, schedule_type, scheduled_at")
    .single();
  if (error) {
    throw error;
  }
  const scheduledIl = data.scheduled_at
    ? new Date(data.scheduled_at).toLocaleString("he-IL", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jerusalem",
      })
    : null;
  return {
    agent_task_id: data.id,
    title: data.title,
    status: data.status,
    schedule_type: data.schedule_type,
    scheduled_at_utc: data.scheduled_at,
    scheduled_at_israel: scheduledIl,
    reminder_phone: looksLikeReminder ? callerPhone : null,
    note: scheduledIl
      ? `המשימה תוזמנה ל-${scheduledIl} (שעון ישראל). השיבי למשתמש את הזמן בשעון ישראל בלבד.`
      : "נשמר ללא תזמון.",
  };
}
