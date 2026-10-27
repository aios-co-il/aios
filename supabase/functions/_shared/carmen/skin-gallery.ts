/**
 * What get_carmen_skins returns: Carmen's public personas (skin-roles.ts), each with its
 * portrait. A built-in portrait is a path the web app serves; an image the tenant uploaded for
 * a skin (ai_agents.metadata.visual_identity.skins[slug].avatarPath) is signed by the caller
 * and replaces it.
 */
import { CARMEN_ROLES } from "./skin-roles.ts";

export const SKIN_PORTRAIT_ROOT = "/brand/carmen/skins/";
/** The general Carmen image the app shows for a persona without a portrait of its own. */
export const CARMEN_DEFAULT_PORTRAIT = "/brand/carmen/carmen-character-hq.webp";

export type SkinPortraitSource = "builtin" | "custom" | "default";

export interface CarmenSkinEntry {
  slug: string;
  name: string;
  members: string[];
  has_portrait: boolean;
  portrait_url: string;
  source: SkinPortraitSource;
  /** The skin slug whose custom image is shown, when source is "custom". */
  custom_skin?: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Custom skin images by skin slug, from the Carmen agent's metadata. Only paths in the tenant's
 * own avatar folder count, so the server never signs a file of another tenant.
 */
export function customSkinPaths(
  metadata: unknown,
  tenantId: string,
): Record<string, string> {
  const skins = asRecord(asRecord(asRecord(metadata).visual_identity).skins);
  const prefix = `${tenantId}/agent-avatars/`;
  const out: Record<string, string> = {};
  if (!tenantId) return out;
  for (const [slug, value] of Object.entries(skins)) {
    const path = asRecord(value).avatarPath;
    if (typeof path === "string" && path.startsWith(prefix)) out[slug] = path;
  }
  return out;
}

/** The custom image a persona shows: its own slug first, then its member skins in order. */
export function customPathForRole(
  role: { slug: string; members: readonly string[] },
  paths: Record<string, string>,
): { skin: string; path: string } | null {
  for (const skin of [role.slug, ...role.members]) {
    if (paths[skin]) return { skin, path: paths[skin] };
  }
  return null;
}

/** Every persona with its portrait; `signed` maps a custom path to its signed URL. */
export function carmenSkinEntries(
  paths: Record<string, string> = {},
  signed: Record<string, string> = {},
): CarmenSkinEntry[] {
  return CARMEN_ROLES.map((role) => {
    const base = {
      slug: role.slug,
      name: role.name,
      members: [...role.members],
    };
    const custom = customPathForRole(role, paths);
    const customUrl = custom ? signed[custom.path] : undefined;
    if (custom && customUrl)
      return {
        ...base,
        has_portrait: true,
        portrait_url: customUrl,
        source: "custom" as const,
        custom_skin: custom.skin,
      };
    if (role.portrait)
      return {
        ...base,
        has_portrait: true,
        portrait_url: `${SKIN_PORTRAIT_ROOT}${role.portrait}.webp`,
        source: "builtin" as const,
      };
    return {
      ...base,
      has_portrait: false,
      portrait_url: CARMEN_DEFAULT_PORTRAIT,
      source: "default" as const,
    };
  });
}

/** The custom paths the caller needs to sign: one per persona at most. */
export function pathsToSign(paths: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const role of CARMEN_ROLES) {
    const custom = customPathForRole(role, paths);
    if (custom) out.add(custom.path);
  }
  return [...out];
}

/** The tool result: the personas and how to show them. */
export function carmenSkinsResult(entries: CarmenSkinEntry[]) {
  return {
    count: entries.length,
    skins: entries,
    how_to_show:
      "portrait_url נפתח בצ׳אט כתמונת Markdown: ![שם](portrait_url). source=custom היא תמונה שהעסק העלה (קישור זמני לשעה), builtin היא התמונה המובנית, default היא התמונה הכללית של כרמן לפרסונה בלי דיוקן משלה.",
  };
}
