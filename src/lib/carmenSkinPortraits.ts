const ROOT = "/brand/carmen/skins/";

/** Only the main personas receive a built-in portrait; other skills keep their existing fallback. */
const PORTRAITS: Record<string, string> = {
  copywriter: "copywriter",
  video_director: "director",
  director: "director",
  creative_direct: "designer",
  designer: "designer",
  graphic_designer: "designer",
  video_editor: "video-editor",
  video_editing: "video-editor",
  web_builder: "web-builder",
  website_builder: "web-builder",
  automator: "automator",
  cfo: "finance",
  finance: "finance",
};
const ROLE_NAMES: Record<string, string> = {
  קופירייטרית: "copywriter",
  במאית: "director",
  "במאית וידאו": "director",
  מעצבת: "designer",
  "מעצבת גרפית": "designer",
  "עורכת וידאו": "video-editor",
  "בונה אתרים": "web-builder",
  אוטומטורית: "automator",
  אוטומטור: "automator",
  כספים: "finance",
  "איש כספים": "finance",
};

export function getSkinPortrait(slug?: string | null, name?: string | null) {
  const role = (slug && PORTRAITS[slug]) || (name && ROLE_NAMES[name.trim()]);
  return role ? `${ROOT}${role}.webp` : undefined;
}

export function isBuiltInSkinPortrait(url?: string) {
  return !!url?.startsWith(ROOT);
}
