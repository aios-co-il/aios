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
