import {
  folderTree,
  type ArtifactKind,
} from "../../../supabase/functions/_shared/workshop/artifacts.ts";

export interface WorkshopArtifact {
  id: string;
  item_id: string;
  kind: ArtifactKind;
  folder: string;
  title: string;
  status: "pending" | "ready" | "failed" | "approved";
  url: string | null;
  thumb_url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type PageType = "brief" | "image" | "video" | "audio" | "text";

export function pageTypeOf(kind: ArtifactKind): PageType {
  switch (kind) {
    case "brief":
      return "brief";
    case "image":
    case "variation":
    case "scene_still":
      return "image";
    case "clip":
    case "film":
      return "video";
    case "narration":
    case "music":
      return "audio";
    default:
      return "text";
  }
}

/** A reference can be a picture or a film; the file says which. */
export const referenceIsVideo = (artifact: WorkshopArtifact) =>
  /\.(mp4|mov|webm)(\?|$)/i.test(artifact.url ?? "");

export function pageTypeFor(artifact: WorkshopArtifact): PageType {
  if (artifact.kind === "reference")
    return referenceIsVideo(artifact) ? "video" : "image";
  return pageTypeOf(artifact.kind);
}

export function artifactText(artifact: WorkshopArtifact): string {
  const meta = artifact.meta;
  for (const key of ["text", "content", "brief"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** The pages to show: all of them, or one folder's. The feed keeps arrival order. */
export function pagesIn(
  artifacts: WorkshopArtifact[],
  folder: string | null,
): WorkshopArtifact[] {
  const ordered = [...artifacts].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  return folder === null
    ? ordered
    : ordered.filter((artifact) => artifact.folder === folder);
}

export const foldersOf = (artifacts: WorkshopArtifact[]) =>
  folderTree(artifacts);

/** Whether a new page should pull the board down to it. */
export function shouldFollow(
  previousCount: number,
  nextCount: number,
  following: boolean,
) {
  return following && nextCount > previousCount;
}
