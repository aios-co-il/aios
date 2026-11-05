import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../database.types.ts";

type ArtifactRow = Database["public"]["Tables"]["workshop_artifacts"]["Row"];

/** The page the user marked on the board, as Carmen needs it to act on it. */
export type SelectedArtifact = Pick<
  ArtifactRow,
  "id" | "kind" | "title" | "status" | "url" | "thumb_url"
>;

/**
 * Reads the marked page, only when it belongs to the open project of this tenant. Before this,
 * Carmen got only its id and, asked for a video from it, invented a link that did not load.
 */
export async function loadSelectedArtifact(
  db: SupabaseClient<Database>,
  tenantId: string,
  itemId: string,
  artifactId: string | null,
): Promise<SelectedArtifact | null> {
  if (!artifactId) {
    return null;
  }
  const { data, error } = await db
    .from("workshop_artifacts")
    .select("id, kind, title, status, url, thumb_url")
    .match(selectedArtifactScope(tenantId, itemId, artifactId))
    .maybeSingle();
  if (error) {
    console.error("[workshop] selected artifact lookup failed", error.message);
    return null;
  }
  return data;
}

/** The marked page is read only inside this tenant's open project. */
export function selectedArtifactScope(
  tenantId: string,
  itemId: string,
  artifactId: string,
) {
  return { id: artifactId, tenant_id: tenantId, item_id: itemId };
}

/** The page's web link (its file, else its thumbnail); a storage path is not one. */
export function artifactWebLink(artifact: SelectedArtifact) {
  return webLink(artifact.url) ?? webLink(artifact.thumb_url);
}

/** The turn-note line that tells Carmen what the user marked and the link to use for it. */
export function selectedArtifactLine(artifact: SelectedArtifact | null) {
  if (!artifact) {
    return null;
  }
  const label = KIND_LABEL[artifact.kind] ?? artifact.kind;
  const title = artifact.title ? ` "${artifact.title}"` : "";
  const link = artifactWebLink(artifact);
  const where = link
    ? ` הכתובת שלו: ${link}. כשצריך רפרנס או תמונת מקור ממנו, העבירי את הכתובת הזו כמו שהיא.`
    : "";
  return `המשתמש סימן בלוח את ה${label}${title} (artifact_id=${artifact.id}). "זה", "מה שסימנתי" ו"התמונה" מתייחסים אליו.${where}`;
}

const KIND_LABEL: Record<string, string> = {
  image: "תמונה",
  variation: "וריאציה",
  scene_still: "תמונת סצנה",
  clip: "קליפ",
  film: "סרט",
  copy: "טקסט",
  concept: "קונספט",
  reference: "רפרנס",
  article: "כתבה",
};

const webLink = (value: string | null) =>
  value && /^https?:\/\//i.test(value) ? value : null;

const PICTURE_KINDS = new Set([
  "image",
  "variation",
  "scene_still",
  "reference",
]);

/**
 * A video asked for while a picture is marked: the exact call Carmen makes, decided here. On
 * Staging she picked workshop_edit_from_assets, which needs uploaded footage, and answered that
 * the project had no video asset.
 */
export function markedPictureFilmLine(
  artifact: SelectedArtifact | null,
  wantsVideo: boolean,
) {
  if (!artifact || !wantsVideo || !PICTURE_KINDS.has(artifact.kind)) {
    return null;
  }
  return `המשתמש מבקש סרטון מהתמונה שסומנה בלוח: קראי ל-workshop_storyboard עם from_artifact_id=${artifact.id} וסצנות שמתארות את התנועה שביקש. לא workshop_edit_from_assets ולא workshop_add_assets: התמונה כבר בפרויקט.`;
}
