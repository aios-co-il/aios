/**
 * Per-user Carmen brain permissions (carmen_command_center_access row).
 * Pure helpers shared by the settings screen, the chat UI and the edge
 * functions, so all three agree on who may use which brain.
 */

export type BrainLevel = "full" | "bugfix";

export type BrainAccessRow = {
  enabled?: boolean | null;
  brain_access?: Record<string, unknown> | null;
} | null;

/** Brains where "bug fixes only" makes sense: the coding agents. */
export const BUGFIX_CAPABLE_PROVIDERS = ["cursor", "claude", "codex", "grok"];

export function parseLevel(v: unknown): BrainLevel | null {
  return v === "full" || v === "bugfix" ? v : null;
}

/**
 * The user's level on one brain. No row, or a row whose brain_access is null,
 * means the user's brains were never restricted, so they keep full access.
 * A brain_access object without the slug means no access to that brain.
 */
export function brainLevel(
  row: BrainAccessRow | undefined,
  slug: string | null | undefined,
): BrainLevel | null {
  if (!row) return "full";
  if (row.enabled === false) return null;
  if (!slug) return null;
  if (row.brain_access == null) return "full";
  return parseLevel(row.brain_access[slug]);
}

/** May this user open Carmen at all? */
export function carmenEnabledFor(row: BrainAccessRow | undefined): boolean {
  if (!row) return true;
  if (row.enabled === false) return false;
  if (row.brain_access == null) return true;
  return Object.values(row.brain_access).some((v) => parseLevel(v));
}

export function allowedRoutes<T extends { slug: string }>(
  routes: T[],
  row: BrainAccessRow | undefined,
): T[] {
  return routes.filter((r) => brainLevel(row, r.slug) !== null);
}

/** Prepended to a message on a "bug fixes only" coding brain. */
export const BUGFIX_ONLY_PREAMBLE =
  "[AIOS permission: this user may request BUG FIXES ONLY. " +
  "Fix the reported bug with the smallest change. Do not build new features, " +
  "refactor, or change behaviour beyond the fix. If the request is not a bug " +
  "fix, reply that it needs a full-access user and do nothing else.]\n\n";
