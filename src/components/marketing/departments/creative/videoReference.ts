import type { StoryboardFrame } from "./types";

export const REFERENCE_MAX_BYTES = 200 * 1024 * 1024;

export interface ReferenceShot {
  index: number;
  start: number;
  end: number;
  duration: number;
  shot_type?: string;
  description?: string;
  motion?: string;
  transcript?: string;
  keyframe_path?: string;
}

export interface ReferenceProposalFrame {
  title?: string;
  shot?: string;
  visualPrompt?: string;
  motionPrompt?: string;
  overlayText?: string;
  voiceover?: string;
  duration?: number;
  referenceShot?: number;
}

export interface ReferenceRun {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  error: string | null;
  created_at: string;
  output: {
    shots?: ReferenceShot[];
    proposal?: {
      concept?: { name?: string; bigIdea?: string };
      frames?: ReferenceProposalFrame[];
    };
    video?: { duration?: number };
    seconds?: number;
  } | null;
}

export const isReferenceRunActive = (
  run?: Pick<ReferenceRun, "status"> | null,
) => run?.status === "queued" || run?.status === "running";

/** Storage path for an uploaded reference: tenant/client/item/reference/reference-<ts>.<ext>. */
export const referenceVideoPath = ({
  tenantId,
  clientId,
  itemId,
  fileName,
  now = Date.now(),
}: {
  tenantId: string;
  clientId: string | null;
  itemId: string;
  fileName: string;
  now?: number;
}) => {
  const ext =
    (fileName.split(".").pop() || "mp4")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "mp4";
  return `${tenantId}/${clientId ?? "general"}/${itemId}/reference/reference-${now}.${ext}`;
};

/** Proposed frames → new storyboard frames (fresh ids, in order). */
export function proposalToFrames(
  frames: ReferenceProposalFrame[],
  frameX: (order: number) => number,
  newId: () => string = () => crypto.randomUUID(),
): StoryboardFrame[] {
  return frames.map((frame, index) => ({
    id: newId(),
    order: index + 1,
    title: frame.title?.trim() || `סצנה ${index + 1}`,
    shot: frame.shot?.trim() || "Medium shot",
    visualPrompt: frame.visualPrompt?.trim() ?? "",
    motionPrompt: frame.motionPrompt?.trim() ?? "",
    overlayText: frame.overlayText?.trim() ?? "",
    voiceover: frame.voiceover?.trim() ?? "",
    duration: Math.max(0.5, Math.min(30, Number(frame.duration) || 3)),
    x: frameX(index + 1),
    y: 100,
    status: "draft",
    locked: false,
    hasCharacter: true,
  }));
}
