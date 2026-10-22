import {
  BUGFIX_CAPABLE_PROVIDERS,
  parseLevel,
  type BrainLevel,
} from "@/lib/carmenBrainAccess";

export type Route = {
  id: string;
  slug: string;
  label: string;
  route_type: string;
  provider: string | null;
};

export type DevTier = "full" | "bugfix";

export type AccessRow = {
  id: string;
  user_id: string | null;
  enabled: boolean;
  /** null = no brain restriction (every brain, full access). */
  brain_access: Record<string, unknown> | null;
  dev_escalation_tier: DevTier | null;
};

export type AccessPatch = Partial<Omit<AccessRow, "id" | "user_id">>;

export const NONE = "none";
export const LEVEL_LABEL: Record<string, string> = {
  [NONE]: "אין גישה",
  full: "גישה מלאה",
  bugfix: "תיקונים בלבד",
};

export const canBugfix = (r: Route) =>
  r.route_type === "direct_channel" &&
  BUGFIX_CAPABLE_PROVIDERS.includes(String(r.provider || r.slug));

/** The level shown for one brain; a null brain_access means full everywhere. */
export function levelFor(row: AccessRow, slug: string): BrainLevel | null {
  if (row.brain_access == null) return "full";
  return parseLevel(row.brain_access[slug]);
}

/**
 * The brain_access object after changing one brain. Starting from "no
 * restriction" spells out every brain as full so the others keep access.
 */
export function nextBrainAccess(
  row: AccessRow,
  routes: Route[],
  slug: string,
  value: string,
): Record<string, unknown> {
  const next: Record<string, unknown> =
    row.brain_access == null
      ? Object.fromEntries(routes.map((r) => [r.slug, "full"]))
      : { ...row.brain_access };
  if (value === NONE) delete next[slug];
  else next[slug] = value as BrainLevel;
  return next;
}
