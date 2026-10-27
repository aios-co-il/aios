/**
 * What get_carmen_skins returns: Carmen's public personas (skin-roles.ts), each with its
 * portrait as a full link. A built-in portrait is a file the web app serves (linked on the
 * app's origin); an image the tenant uploaded for a skin
 * (ai_agents.metadata.visual_identity.skins[slug].avatarPath) is signed by the caller and
 * replaces it.
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

/** Production's address: the fallback, as for other app links (APP_URL elsewhere). */
export const DEFAULT_APP_ORIGIN = "https://aios.co.il";

/** Hosts the AIOS web app runs on: production, staging, Vercel previews and local dev. */
const APP_HOST =
  /^(?:aios\.co\.il|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.aios\.co\.il|[a-z0-9-]+\.vercel\.app)$/i;

const originOf = (value: string | null | undefined): URL | null => {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
};

/**
 * The web app's origin for full portrait links: the chat's own origin when it is the AIOS app
 * (so Staging and previews show their own images), else APP_URL, else production.
 */
export function appOrigin(
  requestOrigin?: string | null,
  appUrl?: string | null,
): string {
  const request = originOf(requestOrigin);
  if (
    request &&
    ((request.protocol === "https:" && APP_HOST.test(request.hostname)) ||
      (request.protocol === "http:" &&
        /^(localhost|127\.0\.0\.1)$/.test(request.hostname)))
  )
    return request.origin;
  const configured = originOf(appUrl);
  if (configured && /^https?:$/.test(configured.protocol))
    return configured.origin;
  return DEFAULT_APP_ORIGIN;
}

/** A full link: the app origin before a path the web app serves; a full URL stays as is. */
export function absolutePortraitUrl(
  url: string,
  origin: string = DEFAULT_APP_ORIGIN,
) {
  return url.startsWith("/") ? `${origin.replace(/\/+$/, "")}${url}` : url;
}

/** The tool result: the personas, each portrait as a full link, and how to show them. */
export function carmenSkinsResult(
  entries: CarmenSkinEntry[],
  origin: string = DEFAULT_APP_ORIGIN,
) {
  return {
    count: entries.length,
    skins: entries.map((entry) => ({
      ...entry,
      portrait_url: absolutePortraitUrl(entry.portrait_url, origin),
    })),
    how_to_show:
      "בצ׳אט של AIOS שמציג Markdown: ![שם](portrait_url). בוואטסאפ ובצ׳אט סטודיו הווידאו (טקסט בלבד): שם הפרסונה והקישור portrait_url, בלי Markdown. source=custom היא תמונה שהעסק העלה (קישור זמני לשעה), builtin היא התמונה המובנית, default היא התמונה הכללית של כרמן לפרסונה בלי דיוקן משלה.",
  };
}
