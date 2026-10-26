import { Constants, type Database } from "@/integrations/supabase/types";

export type AutomationTrigger =
  Database["public"]["Enums"]["automation_trigger"];

const AUTOMATION_TRIGGERS: readonly string[] =
  Constants.public.Enums.automation_trigger;

export function isAutomationTrigger(
  value: string | null | undefined,
): value is AutomationTrigger {
  return typeof value === "string" && AUTOMATION_TRIGGERS.includes(value);
}

const FORM_TRIGGER_LABELS = {
  task_assigned: "משימה שוייכה",
  task_collaborator_added: "קמפיינר נוסף למשימה",
  task_update_added: "עדכון נוסף למשימה",
  task_status_changed: "סטטוס משימה השתנה",
  lead_status_changed: "סטטוס ליד השתנה",
  lead_created: "ליד נוצר",
  client_created: "לקוח נוצר",
  client_status_changed: "סטטוס לקוח השתנה",
  onboarding_status_changed: "סטטוס קליטה השתנה",
  meeting_created: "נוצרה פגישה",
  meeting_day_after: "יום לאחר קביעת פגישה",
  meeting_same_day: "ביום הפגישה",
  task_calendar_created: "משימה נוספה ליומן",
  task_overdue: "משימה לא הושלמה בזמן",
  inbound_webhook_task: "קבלת משימה מ-Webhook",
  inbound_webhook_lead: "קליטת ליד מ-Webhook",
  report_alert_triggered: "התראת דוח פייסבוק",
} as const;

export type FormTrigger = keyof typeof FORM_TRIGGER_LABELS;

export const FORM_TRIGGER_VALUES = [
  "task_assigned",
  "task_collaborator_added",
  "task_update_added",
  "task_status_changed",
  "lead_status_changed",
  "lead_created",
  "client_created",
  "client_status_changed",
  "onboarding_status_changed",
  "meeting_created",
  "meeting_day_after",
  "meeting_same_day",
  "task_calendar_created",
  "task_overdue",
  "inbound_webhook_task",
  "inbound_webhook_lead",
  "report_alert_triggered",
] as const satisfies readonly FormTrigger[];

export const FORM_TRIGGER_OPTIONS: { value: FormTrigger; label: string }[] =
  FORM_TRIGGER_VALUES.map((value) => ({
    value,
    label: FORM_TRIGGER_LABELS[value],
  }));
