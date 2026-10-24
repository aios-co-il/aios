/** Public-facing personas. Member skins remain registered and usable internally. */
export const CARMEN_ROLES = [
  {
    slug: "marketing_manager",
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
    name: "קופירייטרית",
    portrait: "copywriter",
    members: ["copywriter", "content_writer"],
  },
  {
    slug: "video_director",
    name: "במאית",
    portrait: "director",
    members: ["video_director", "director"],
  },
  {
    slug: "creative_direct",
    name: "מעצבת",
    portrait: "designer",
    members: ["creative_direct", "designer", "graphic_designer"],
  },
  {
    slug: "video_editor",
    name: "עורכת וידאו",
    portrait: "video-editor",
    members: ["video_editor", "video_editing", "creative_studio"],
  },
  {
    slug: "web_builder",
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
    name: "אוטומטורית",
    portrait: "automator",
    members: ["automator", "automation_specialist"],
  },
  {
    slug: "cfo",
    name: "כספים",
    portrait: "finance",
    members: ["cfo", "finance"],
  },
  {
    slug: "campaigner",
    name: "קמפיינרית",
    portrait: "campaigner",
    members: ["campaigner", "paid_media"],
  },
  {
    slug: "seo",
    name: "SEO / GEO",
    portrait: "seo-geo",
    members: ["seo", "geo", "seo_geo"],
  },
  {
    slug: "analyst",
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
