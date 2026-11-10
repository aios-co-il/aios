/**
 * Public-facing personas. Member skins remain registered and usable internally.
 * `orbTint` is the persona's orb color (HSL channels) in the orb avatar style;
 * null follows the tenant brand accent.
 */
export const CARMEN_ROLES = [
  {
    slug: "marketing_manager",
    orbTint: null,
    name: "מנהלת שיווק",
    portrait: null,
    members: [
      "marketing_manager",
      "ceo",
      "coo",
      "cs_manager",
      "social_media",
      "sdr",
      "pm",
    ],
  },
  {
    slug: "copywriter",
    orbTint: "330 81% 60%",
    name: "קופירייטרית",
    portrait: "copywriter",
    members: ["copywriter", "content_writer", "workshop_copywriter"],
  },
  {
    slug: "video_director",
    orbTint: "0 72% 58%",
    name: "במאית",
    portrait: "director",
    members: ["video_director", "director", "workshop_producer"],
  },
  {
    slug: "creative_direct",
    orbTint: "280 70% 62%",
    name: "מעצבת",
    portrait: "designer",
    members: [
      "creative_direct",
      "designer",
      "graphic_designer",
      "workshop_designer",
    ],
  },
  {
    slug: "video_editor",
    orbTint: "24 90% 56%",
    name: "עורכת וידאו",
    portrait: "video-editor",
    members: [
      "video_editor",
      "video_editing",
      "creative_studio",
      "workshop_editor",
    ],
  },
  {
    slug: "web_builder",
    orbTint: "199 89% 50%",
    name: "בונה אתרים",
    portrait: "web-builder",
    members: [
      "web_builder",
      "website_builder",
      "engineer",
      "qa",
      "qa_loop",
      "devops",
      "security",
      "cto",
    ],
  },
  {
    slug: "automator",
    orbTint: "38 92% 52%",
    name: "אוטומטורית",
    portrait: "automator",
    members: ["automator", "automation_specialist"],
  },
  {
    slug: "cfo",
    orbTint: "160 64% 40%",
    name: "כספים",
    portrait: "finance",
    members: ["cfo", "finance"],
  },
  {
    slug: "campaigner",
    orbTint: "217 91% 60%",
    name: "קמפיינרית",
    portrait: "campaigner",
    members: ["campaigner", "paid_media"],
  },
  {
    slug: "seo",
    orbTint: "262 83% 66%",
    name: "SEO / GEO",
    portrait: "seo-geo",
    members: ["seo", "geo", "seo_geo"],
  },
  {
    slug: "analyst",
    orbTint: "186 80% 42%",
    name: "אנליסטית דוחות",
    portrait: "analyst",
    members: ["analyst", "data", "reports_analyst"],
  },
] as const;

export function getCarmenRole(slug?: string | null) {
  return CARMEN_ROLES.find(
    (role) =>
      role.slug === slug ||
      (role.members as readonly string[]).includes(slug ?? ""),
  );
}

/** Orb color (HSL channels) for a skin, or undefined to use the brand accent. */
export function getRoleOrbTint(slug?: string | null): string | undefined {
  return getCarmenRole(slug)?.orbTint ?? undefined;
}

/** Retain direct/internal callers and honor disabled and already pinned skins. */
export function activeRoleSlugs(
  slug: string,
  disabled: readonly string[] = [],
  pinned: readonly string[] = [],
) {
  if (disabled.includes(slug)) return [];
  const members: readonly string[] = CARMEN_ROLES.find(
    (role) => role.slug === slug,
  )?.members ?? [slug];
  return [...new Set([slug, ...members])].filter(
    (member) => !disabled.includes(member) && !pinned.includes(member),
  );
}
