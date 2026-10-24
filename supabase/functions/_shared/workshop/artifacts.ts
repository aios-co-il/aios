/** The pages of the workshop board and the folder each one lives in. */

export const ARTIFACT_KINDS = [
  "brief",
  "concept",
  "copy",
  "image",
  "variation",
  "storyboard",
  "scene_still",
  "clip",
  "narration",
  "music",
  "film",
  "reference",
  "article",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ARTIFACT_STATUSES = [
  "pending",
  "ready",
  "failed",
  "approved",
] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const FOLDER_BY_KIND: Record<ArtifactKind, string> = {
  brief: "",
  concept: "copy",
  copy: "copy",
  image: "images",
  variation: "images",
  storyboard: "video/scenes",
  scene_still: "video/scenes",
  clip: "video/scenes",
  narration: "video/narration",
  music: "video/music",
  film: "video/film",
  reference: "references",
  article: "copy",
};

export const FOLDER_LABELS: Record<string, string> = {
  "": "בריף",
  copy: "קופי",
  images: "תמונות",
  video: "וידאו",
  "video/scenes": "סצנות",
  "video/film": "סרט סופי",
  "video/narration": "קריינות",
  "video/music": "מוזיקה",
  references: "רפרנסים",
};

export interface ArtifactInput {
  tenantId: string;
  itemId: string;
  kind: ArtifactKind;
  title: string;
  status?: ArtifactStatus;
  url?: string | null;
  thumbUrl?: string | null;
  refTable?: string | null;
  refId?: string | null;
  meta?: Record<string, unknown>;
  folder?: string;
}

/** The workshop_artifacts row for a tool result; the feed order is the insertion time. */
export function artifactRow(input: ArtifactInput) {
  return {
    tenant_id: input.tenantId,
    item_id: input.itemId,
    kind: input.kind,
    folder: input.folder ?? FOLDER_BY_KIND[input.kind],
    title: input.title.trim().slice(0, 200),
    status: input.status ?? "ready",
    url: input.url ?? null,
    thumb_url: input.thumbUrl ?? input.url ?? null,
    ref_table: input.refTable ?? null,
    ref_id: input.refId ?? null,
    meta: input.meta ?? {},
  };
}

/** The folder tree of a project: the folders that hold something, with counts. */
export function folderTree(
  artifacts: { folder: string }[],
): { folder: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const artifact of artifacts)
    counts.set(artifact.folder, (counts.get(artifact.folder) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, count]) => ({
      folder,
      label: FOLDER_LABELS[folder] ?? folder,
      count,
    }));
}

/** Which Carmen skin is wearing the hat for a tool, so the avatar follows the work. */
export function skinForTool(tool: string): string | null {
  if (
    /^workshop_(plan_concepts|write_copy|save_concepts|save_copy)$/.test(tool)
  )
    return "copywriter";
  if (
    /^workshop_(storyboard|make_stills|animate|sound|produce_video|edit_video)$/.test(
      tool,
    )
  )
    return "video_director";
  if (
    /^workshop_(start_project|make_creative|revise|attach|assign_client|check_connections|inspect_site|add_assets)$/.test(
      tool,
    )
  )
    return "creative_studio";
  return null;
}
