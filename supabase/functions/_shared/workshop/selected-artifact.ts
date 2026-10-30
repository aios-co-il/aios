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
    .eq("id", artifactId)
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (error) {
    console.error("[workshop] selected artifact lookup failed", error.message);
    return null;
  }
  return data;
}

/** The turn-note line that tells Carmen what the user marked and the link to use for it. */
export function selectedArtifactLine(artifact: SelectedArtifact | null) {
  if (!artifact) {
    return null;
  }
  const label = KIND_LABEL[artifact.kind] ?? artifact.kind;
  const title = artifact.title ? ` "${artifact.title}"` : "";
  const link = webLink(artifact.url) ?? webLink(artifact.thumb_url);
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
