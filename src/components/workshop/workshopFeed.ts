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

const RECENT_FAILURE_MS = 30 * 60_000;

/**
 * Failed pages are not kept on the board: they are shown once as an error and removed. Only
 * recent ones are worth saying aloud, an old leftover is cleared quietly.
 */
export function splitFailures(
  rows: WorkshopArtifact[],
  now = Date.now(),
): { kept: WorkshopArtifact[]; failedIds: string[]; messages: string[] } {
  const failed = rows.filter((row) => row.status === "failed");
  const messages = [
    ...new Set(
      failed
        .filter((row) => now - Date.parse(row.created_at) <= RECENT_FAILURE_MS)
        .map((row) => artifactText(row) || "היצירה נכשלה"),
    ),
  ];
  return {
    kept: rows.filter((row) => row.status !== "failed"),
    failedIds: failed.map((row) => row.id),
    messages,
  };
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

/** The folder whose tab shows the storyboard grid (FOLDER_BY_KIND.storyboard). */
export const SCENES_FOLDER = "video/scenes";

/**
 * The folder tabs, with the scenes tab counting the storyboard's scenes. A project whose scenes
 * came from the user's own materials may have no scene pages, so the tab is added for it.
 */
export function folderTabs(artifacts: WorkshopArtifact[], sceneCount: number) {
  const folders = foldersOf(artifacts);
  if (sceneCount === 0) return folders;
  const scenes = { folder: SCENES_FOLDER, label: "סצנות", count: sceneCount };
  return folders.some((entry) => entry.folder === SCENES_FOLDER)
    ? folders.map((entry) =>
        entry.folder === SCENES_FOLDER
          ? { ...entry, count: sceneCount }
          : entry,
      )
    : [...folders, scenes].sort((a, b) => a.folder.localeCompare(b.folder));
}

/** Whether a new page should pull the board down to it. */
export function shouldFollow(
  previousCount: number,
  nextCount: number,
  following: boolean,
) {
  return following && nextCount > previousCount;
}

const isStoragePath = (url: string | null): url is string =>
  !!url && !/^(https?:|data:|blob:)/i.test(url);

/** Files in the private creative-video bucket are stored as paths and need a signed link to show. */
export const storagePathsIn = (artifacts: WorkshopArtifact[]) => [
  ...new Set(
    artifacts.flatMap((a) => [a.url, a.thumb_url]).filter(isStoragePath),
  ),
];

export const withSignedUrls = (
  artifacts: WorkshopArtifact[],
  signed: Record<string, string>,
): WorkshopArtifact[] =>
  artifacts.map((a) => ({
    ...a,
    url: isStoragePath(a.url) ? (signed[a.url] ?? null) : a.url,
    thumb_url: isStoragePath(a.thumb_url)
      ? (signed[a.thumb_url] ?? null)
      : a.thumb_url,
  }));

/** The project's own main format, read from the brief page Carmen wrote when she opened it. */
export function projectFormat(artifacts: WorkshopArtifact[]): string {
  const brief = artifacts.find((a) => a.kind === "brief");
  const plan = brief?.meta?.plan as Record<string, unknown> | undefined;
  const format = plan?.format;
  return typeof format === "string" ? format : "4:5";
}

const CLIP_ENGINE: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  higgsfield: "Higgsfield",
  kling: "Kling",
  mock: "מנוע התצוגה החינמי",
};

const engineName = (value: unknown) =>
  typeof value === "string" ? (CLIP_ENGINE[value] ?? value) : "";

/** When the worker could not use the chosen engine for a clip, the page says what it used instead. */
export function fallbackNote(artifact: WorkshopArtifact): string | null {
  const from = engineName(artifact.meta.fallback_from);
  if (!from) return null;
  const used = engineName(artifact.meta.provider);
  return used
    ? `הונפש ב${used} במקום ${from}`
    : `הונפש במנוע אחר במקום ${from}`;
}
