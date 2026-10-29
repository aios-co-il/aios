/**
 * Carmen's automations that are already switched per org in
 * tenant_heartbeat_settings (AIO-316), as rows of the אוטומציות filter. The
 * cards read and write the same fields as the full heartbeat settings, so the
 * two screens always agree and no data moves.
 */
import {
  DEFAULT_MANAGER_MODE,
  type ManagerMode,
} from "../../supabase/functions/_shared/manager-round/modes.ts";
import { resolveManagerSettings } from "../../supabase/functions/_shared/manager-round/settings.ts";
import {
  isJsonObject,
  type JsonObject,
} from "../../supabase/functions/_shared/pulse/json.ts";
import type { CarmenTaskRow } from "./carmenTaskRows";
import { getCronMeta, type CronJobMeta } from "./cronJobsCatalog";
import { parsePulseAlertRules } from "./pulseAlertRules";

export const SETTINGS_AUTOMATION_KEYS = [
  "heartbeat",
  "weekly_pulse",
  "instant_pulse_alerts",
  "manager_round",
] as const;

export type SettingsAutomationKey = (typeof SETTINGS_AUTOMATION_KEYS)[number];

/** The stored fields the cards read; null when the org has no settings row. */
export type HeartbeatAutomationFields = {
  enabled: boolean | null;
  campaign_pulse_enabled: boolean | null;
  pulse_alert_rules: unknown;
} | null;

/** The columns of tenant_heartbeat_settings one switch writes. */
export type HeartbeatAutomationPatch =
  | { enabled: boolean }
  | { campaign_pulse_enabled: boolean }
  | { pulse_alert_rules: JsonObject };

/** Instant alerts have no scheduled job of their own; they ride on the pulse snapshot. */
const INSTANT_ALERTS_META: CronJobMeta = {
  label: "התראות דופק מיידיות",
  description:
    "כשבדיקת הדופק מזהה לקוח בלי קשר, קפיצה בעלות לליד או חיבור שנותק, כרמן שולחת התראה מיידית.",
  category: "carmen",
  icon: "⚡",
  sends: "whatsapp",
  sendsNote: "פועלות רק כשבדיקת הדופק השבועית מופעלת.",
};

const SETTINGS_JOBS: Record<
  Exclude<SettingsAutomationKey, "instant_pulse_alerts">,
  string
> = {
  heartbeat: "carmen-heartbeat",
  weekly_pulse: "campaign-pulse-sunday-0730",
  manager_round: "carmen-manager-round-15m",
};

const SETTINGS_SCHEDULES: Record<SettingsAutomationKey, string> = {
  heartbeat: "לפי מרווח ה-Heartbeat",
  weekly_pulse: "ראשון 07:30",
  instant_pulse_alerts: "עם בדיקת הדופק",
  manager_round: "כל 15 דקות",
};

/** Name, description and what it sends for one of these automations. */
export function settingsAutomationMeta(
  key: SettingsAutomationKey,
): CronJobMeta {
  return key === "instant_pulse_alerts"
    ? INSTANT_ALERTS_META
    : getCronMeta(SETTINGS_JOBS[key]);
}

/** A key from a route segment, or null when it names none of these. */
export function asSettingsAutomationKey(
  value: string,
): SettingsAutomationKey | null {
  return SETTINGS_AUTOMATION_KEYS.find((key) => key === value) ?? null;
}

/** Whether the automation is on, with the same defaults the workers use. */
export function settingsAutomationEnabled(
  fields: HeartbeatAutomationFields,
  key: SettingsAutomationKey,
): boolean {
  switch (key) {
    case "heartbeat":
      return fields?.enabled === true;
    case "weekly_pulse":
      return fields?.campaign_pulse_enabled === true;
    case "instant_pulse_alerts":
      return (
        parsePulseAlertRules(fields?.pulse_alert_rules).instant_wa_enabled ===
        true
      );
    case "manager_round":
      return resolveManagerSettings(fields?.pulse_alert_rules).mode !== "off";
  }
}

/**
 * The columns to write to switch `key`. pulse_alert_rules is merged into the
 * stored JSON so every other rule and manager key is kept. Turning the manager
 * round on sets observe (dashboard only); a sending mode is chosen only in the
 * full settings, never by this switch.
 */
export function settingsAutomationPatch(
  fields: HeartbeatAutomationFields,
  key: SettingsAutomationKey,
  on: boolean,
): HeartbeatAutomationPatch {
  const stored = isJsonObject(fields?.pulse_alert_rules)
    ? fields.pulse_alert_rules
    : {};
  switch (key) {
    case "heartbeat":
      return { enabled: on };
    case "weekly_pulse":
      return { campaign_pulse_enabled: on };
    case "instant_pulse_alerts":
      return { pulse_alert_rules: { ...stored, instant_wa_enabled: on } };
    case "manager_round": {
      const manager = isJsonObject(stored.manager) ? stored.manager : {};
      const mode: ManagerMode = on ? DEFAULT_MANAGER_MODE : "off";
      return {
        pulse_alert_rules: { ...stored, manager: { ...manager, mode } },
      };
    }
  }
}

/** One row per automation, read from the org's heartbeat settings. */
export function mapSettingsAutomations(
  fields: HeartbeatAutomationFields,
  updatedAt: string | null,
): Array<CarmenTaskRow> {
  return SETTINGS_AUTOMATION_KEYS.map((key) => {
    const meta = settingsAutomationMeta(key);
    const enabled = settingsAutomationEnabled(fields, key);
    return {
      key: `automation:${key}`,
      kind: "automation",
      source: "automation",
      id: key,
      title: meta.label,
      subtitle: meta.description,
      scheduleLabel: SETTINGS_SCHEDULES[key],
      status: enabled ? "scheduled" : "paused",
      enabled,
      lastRunAt: null,
      nextRunAt: null,
      executorLabel: "כרמן",
      updatedAt,
      raw: { automation_key: key, enabled },
    };
  });
}
