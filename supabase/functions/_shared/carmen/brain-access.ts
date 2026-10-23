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

/** Brain route slugs the permission checks name directly. */
export const BRAIN = {
  internal: "internal",
  parliament: "parliament",
} as const;

/** Brains where "bug fixes only" makes sense: the coding agents. */
export const BUGFIX_CAPABLE_PROVIDERS = ["cursor", "claude", "codex", "grok"];

/** PostgREST filter that finds Carmen among a tenant's agents. */
export const CARMEN_NAME_FILTER = "name.ilike.%carmen%,name.ilike.%כרמן%";

/** Prepended to a message on a "bug fixes only" grant. */
export const BUGFIX_ONLY_PREAMBLE =
  "[AIOS permission: this user may request BUG FIXES ONLY. " +
  "Fix the reported bug with the smallest change. Do not build new features, " +
  "refactor, or change behaviour beyond the fix. If the request is not a bug " +
  "fix, reply that it needs a full-access user and do nothing else.]\n\n";

/** True when an agent name marks it as a Carmen agent. */
export function isCarmenName(name: unknown): boolean {
  return (
    typeof name === "string" &&
    (name.toLowerCase().includes("carmen") || name.includes("כרמן"))
  );
}

export function parseLevel(v: unknown): BrainLevel | null {
  return v === "full" || v === "bugfix" ? v : null;
}

/** Narrows a database row to a BrainAccessRow, or null when it isn't one. */
export function toAccessRow(data: unknown): BrainAccessRow {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const brains = row.brain_access;
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : null,
    brain_access:
      brains && typeof brains === "object" && !Array.isArray(brains)
        ? (brains as Record<string, unknown>)
        : null,
  };
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
  const brains = grantedBrains(row);
  if (brains === "none" || !slug) return null;
  return brains === "all" ? "full" : parseLevel(brains[slug]);
}

/** May this user open Carmen at all? */
export function carmenEnabledFor(row: BrainAccessRow | undefined): boolean {
  const brains = grantedBrains(row);
  if (brains === "all") return true;
  return brains !== "none" && Object.values(brains).some(parseLevel);
}

export function allowedRoutes<T extends { slug: string }>(
  routes: T[],
  row: BrainAccessRow | undefined,
): T[] {
  return routes.filter((r) => brainLevel(row, r.slug) !== null);
}

/** Writes the "bug fixes only" limit into a task on a bugfix grant. */
export function applyBrainLimit(level: BrainLevel | null, text: string) {
  return level === "bugfix" ? BUGFIX_ONLY_PREAMBLE + text : text;
}

/** One reading of a row: every brain, no brain, or a per-slug map. */
function grantedBrains(
  row: BrainAccessRow | undefined,
): "all" | "none" | Record<string, unknown> {
  if (!row) return "all";
  if (row.enabled === false) return "none";
  return row.brain_access ?? "all";
}
