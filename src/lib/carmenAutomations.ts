/**
 * Carmen's per-org automations as task rows (AIO-315). Each key is a switch
 * in carmen_automation_settings (AIO-314); its name, description and what it
 * sends come from the scheduled job that runs it (cronJobsCatalog), so the
 * text lives in one place.
 */
import {
  AUTOMATION_KEYS,
  type AutomationKey,
} from "../../supabase/functions/_shared/automations/keys.ts";
import { getCronMeta, type CronJobMeta } from "./cronJobsCatalog";
import type { CarmenTaskRow } from "./carmenTaskRows";

/** The scheduled job that runs each automation. */
const AUTOMATION_JOBS: Record<AutomationKey, string> = {
  meta_status_check: "meta-operational-check-2h",
  google_status_check: "google-ads-operational-check-2h",
  reconcile_nightly: "carmen-reconcile-nightly",
};

/** How often each automation runs, as the org sees it (the jobs run in UTC). */
const AUTOMATION_SCHEDULES: Record<AutomationKey, string> = {
  meta_status_check: "כל שעתיים",
  google_status_check: "כל שעתיים",
  reconcile_nightly: "כל לילה (01:30 UTC)",
};

export type AutomationSetting = {
  automation_key: string;
  enabled: boolean;
  updated_at: string | null;
};

/** The catalog entry (name, description, what it sends) of an automation. */
export function automationMeta(key: AutomationKey): CronJobMeta {
  return getCronMeta(AUTOMATION_JOBS[key]);
}

/** A key from a route segment, or null when it names no automation. */
export function asAutomationKey(value: string): AutomationKey | null {
  return AUTOMATION_KEYS.find((key) => key === value) ?? null;
}

/** One row per automation; an automation the org never switched is on. */
export function mapAutomations(
  settings: Array<AutomationSetting>,
): Array<CarmenTaskRow> {
  return AUTOMATION_KEYS.map((key) => {
    const meta = automationMeta(key);
    const setting = settings.find((s) => s.automation_key === key);
    const enabled = setting ? setting.enabled : true;
    return {
      key: `automation:${key}`,
      kind: "automation",
      source: "automation",
      id: key,
      title: meta.label,
      subtitle: meta.description,
      scheduleLabel: AUTOMATION_SCHEDULES[key],
      status: enabled ? "scheduled" : "paused",
      enabled,
      lastRunAt: null,
      nextRunAt: null,
      executorLabel: "כרמן",
      updatedAt: setting?.updated_at ?? null,
      raw: { automation_key: key, enabled },
    };
  });
}
