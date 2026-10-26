import { getCarmenRole } from "../../supabase/functions/_shared/carmen/skin-roles";
const ROOT = "/brand/carmen/skins/";

const ROLE_NAMES: Record<string, string> = {
  קמפיינרית: "campaigner",
  "SEO / GEO": "seo-geo",
  "SEO/GEO": "seo-geo",
  "אנליסטית דוחות": "analyst",
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
  const role =
    getCarmenRole(slug)?.portrait || (name && ROLE_NAMES[name.trim()]);
  return role ? `${ROOT}${role}.webp` : undefined;
}

export function isBuiltInSkinPortrait(url?: string) {
  return !!url?.startsWith(ROOT);
}
