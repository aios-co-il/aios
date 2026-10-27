/**
 * Manager round settings: pulse_alert_rules.manager, filled with defaults.
 *
 * Keys owned here (the mode rules live in ./modes.ts): mode, kinds,
 * notify_since (database-stamped, read only), brief_recipients,
 * business_hours, holidays, sla_business_hours, escalation_hours,
 * max_alerts_per_recipient_per_day and round_llm_share_pct. Other keys under
 * manager (cost from AIO-236, card_log_system_sends from AIO-242, future
 * collectors' keys) are read by their own modules and never rewritten here.
 */
import { type FindingKind, isFindingKind } from "./kinds.ts";
import {
  DEFAULT_MANAGER_MODE,
  MANAGER_MODES,
  type ManagerMode,
} from "./modes.ts";

export type KindSettings = {
  enabled: boolean;
  /** Replaces the tenant mode for this kind; null follows the tenant mode. */
  mode: ManagerMode | null;
  /** Database stamp: when this kind started sending; null while it does not. */
  notify_since: string | null;
  card_write: boolean;
};

/** Business window per Israel weekday (0 = Sunday) as [start, end) hours. */
export type BusinessHours = Partial<Record<number, [number, number]>>;

export type ManagerSettings = {
  mode: ManagerMode;
  notify_since: string | null;
  kinds: Partial<Record<FindingKind, KindSettings>>;
  /** User ids; empty means the tenant owners. */
  brief_recipients: string[];
  business_hours: BusinessHours;
  /** Israel calendar days (YYYY-MM-DD) with no business hours. */
  holidays: string[];
  sla_business_hours: number;
  /** Business hours after the first send: [to the manager, to the owner]. */
  escalation_hours: [number, number];
  max_alerts_per_recipient_per_day: number;
  /**
   * Percent of the tenant's monthly LLM budget the round may spend, spread
   * evenly over 30 days (plan C7).
   */
  round_llm_share_pct: number;
};

export const MANAGER_DEFAULTS: Omit<ManagerSettings, "mode" | "kinds"> = {
  notify_since: null,
  brief_recipients: [],
  business_hours: {
    0: [9, 19],
    1: [9, 19],
    2: [9, 19],
    3: [9, 19],
    4: [9, 19],
    5: [9, 13],
  },
  holidays: [],
  sla_business_hours: 4,
  escalation_hours: [4, 24],
  max_alerts_per_recipient_per_day: 8,
  round_llm_share_pct: 10,
};

/** Resolves stored pulse_alert_rules (any shape) to complete manager settings. */
export function resolveManagerSettings(
  pulseAlertRules: unknown,
): ManagerSettings {
  const manager = record(record(pulseAlertRules).manager);
  const d = MANAGER_DEFAULTS;
  return {
    mode: parseMode(manager.mode) ?? DEFAULT_MANAGER_MODE,
    notify_since: isoOrNull(manager.notify_since),
    kinds: parseKinds(manager.kinds),
    brief_recipients: stringList(manager.brief_recipients),
    business_hours:
      parseBusinessHours(manager.business_hours) ?? d.business_hours,
    holidays: stringList(manager.holidays).filter((day) =>
      /^\d{4}-\d{2}-\d{2}$/.test(day),
    ),
    sla_business_hours: positive(
      manager.sla_business_hours,
      d.sla_business_hours,
    ),
    escalation_hours:
      parseEscalation(manager.escalation_hours) ?? d.escalation_hours,
    max_alerts_per_recipient_per_day: positive(
      manager.max_alerts_per_recipient_per_day,
      d.max_alerts_per_recipient_per_day,
    ),
    round_llm_share_pct: Math.min(
      100,
      positive(manager.round_llm_share_pct, d.round_llm_share_pct),
    ),
  };
}

/** Per-kind settings for known kinds; unknown kind keys are dropped. */
function parseKinds(raw: unknown): ManagerSettings["kinds"] {
  const kinds: ManagerSettings["kinds"] = {};
  for (const [key, value] of Object.entries(record(raw))) {
    if (!isFindingKind(key)) {
      continue;
    }
    const own = record(value);
    // An unknown override never sends (the database guard reads it the same way).
    const mode = "mode" in own ? (parseMode(own.mode) ?? "observe") : null;
    kinds[key] = {
      enabled: own.enabled !== false,
      mode,
      notify_since: isoOrNull(own.notify_since),
      card_write: own.card_write === true,
    };
  }
  return kinds;
}

/** Valid weekday windows (Sunday–Friday), or null to use the defaults. */
function parseBusinessHours(raw: unknown): BusinessHours | null {
  const hours: BusinessHours = {};
  for (const [day, window] of Object.entries(record(raw))) {
    const weekday = Number(day);
    // Saturday (6) never has business hours: Shabbat policy (AIO-226).
    if (
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 5 ||
      !Array.isArray(window)
    ) {
      continue;
    }
    const [start, end] = window.map(Number);
    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end <= 24 &&
      start < end
    ) {
      hours[weekday] = [start, end];
    }
  }
  return Object.keys(hours).length ? hours : null;
}

/** [to the manager, to the owner] business hours, the second not before the first. */
function parseEscalation(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) {
    return null;
  }
  const [toManager, toOwner] = raw.map(Number);
  const valid =
    toManager > 0 && toOwner >= toManager && Number.isFinite(toOwner);
  return valid ? [toManager, toOwner] : null;
}

/** A known mode, or null. */
function parseMode(raw: unknown): ManagerMode | null {
  return MANAGER_MODES.find((mode) => mode === raw) ?? null;
}

/** A plain object's own keys, or an empty object. */
function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...raw }
    : {};
}

/** The strings of an array, or an empty list. */
function stringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : [];
}

/** A parseable date string, or null. */
function isoOrNull(raw: unknown): string | null {
  return typeof raw === "string" && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

/** A positive number, or the fallback. */
function positive(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
