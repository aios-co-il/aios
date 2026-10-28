/**
 * Rollout modes of Carmen's manager round and how a tenant's settings turn
 * into the mode of each finding kind. The database guard
 * (carmen_manager_mode_sends / carmen_manager_kind_sends in
 * 20261027100000_carmen_manager_round.sql) reads modes the same way.
 */
import type { FindingKind } from "./kinds.ts";
import type { ManagerSettings } from "./settings.ts";

export const MANAGER_MODES = ["off", "observe", "david_only", "team"] as const;

export type ManagerMode = (typeof MANAGER_MODES)[number];

/** A tenant without a stored mode records findings and sends nothing. */
export const DEFAULT_MANAGER_MODE: ManagerMode = "observe";

/** True for the modes that send WhatsApp (the database guard agrees). */
export function isSendingMode(mode: ManagerMode): boolean {
  return mode === "david_only" || mode === "team";
}

/** True when the tenant mode, or any enabled kind's own mode, sends. */
export function sendsAnything(settings: ManagerSettings): boolean {
  return (
    isSendingMode(settings.mode) ||
    Object.values(settings.kinds).some(
      (own) => own.enabled && !!own.mode && isSendingMode(own.mode),
    )
  );
}

/** The mode a kind runs in: off when disabled, else its override or the tenant mode. */
export function kindMode(
  settings: ManagerSettings,
  kind: FindingKind,
): ManagerMode {
  const own = settings.kinds[kind];
  if (!own) {
    return settings.mode;
  }
  if (!own.enabled) {
    return "off";
  }
  return own.mode ?? settings.mode;
}

/** When the kind started sending (database stamp), or null while it does not. */
export function kindNotifySince(
  settings: ManagerSettings,
  kind: FindingKind,
): string | null {
  const own = settings.kinds[kind];
  return own ? own.notify_since : settings.notify_since;
}
