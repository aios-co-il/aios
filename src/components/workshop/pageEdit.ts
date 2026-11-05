import {
  CONCEPT_LABEL,
  maxWords,
  scriptText,
  spokenWords,
  tapTitle,
  type ScriptBeat,
} from "@functions/_shared/workshop/film-script.ts";
import type { Database } from "@/integrations/supabase/types";
import { artifactText, type WorkshopArtifact } from "./workshopFeedModel";

type EditArgs = Database["public"]["Functions"]["workshop_edit_page"]["Args"];

/** What the user changes on a page: a concept's text, or a script's beats. */
export type PageDraft =
  | { kind: "concept"; text: string }
  | { kind: "script"; beats: Array<ScriptBeat> };

/** The pages the user edits by hand on the board. */
export const isEditablePage = (artifact: WorkshopArtifact) =>
  artifact.status === "ready" &&
  (artifact.kind === "concept" || artifact.kind === "script");

/** The page as a draft to edit, or null when it is not editable. */
export function draftOf(artifact: WorkshopArtifact): PageDraft | null {
  if (!isEditablePage(artifact)) {
    return null;
  }
  if (artifact.kind === "concept") {
    return { kind: "concept", text: artifactText(artifact) };
  }
  return { kind: "script", beats: beatsOf(artifact.meta.beats) };
}

/** The script page's beats as save-script.ts stored them. */
function beatsOf(value: unknown): Array<ScriptBeat> {
  return (Array.isArray(value) ? value : []).map((entry) => {
    const beat = isRecord(entry) ? entry : {};
    const text = (key: string) => {
      const value = beat[key];
      return typeof value === "string" ? value : "";
    };
    return {
      start_s: Number(beat.start_s) || 0,
      end_s: Number(beat.end_s) || 0,
      narration: text("narration"),
      on_screen: text("on_screen"),
      visual: text("visual"),
    };
  });
}

/**
 * The arguments of workshop_edit_page: a script's page text is written the way save-script.ts
 * writes it, so the board and Carmen read the edited script the same way.
 */
export function editArgs(
  artifact: WorkshopArtifact,
  draft: PageDraft,
): EditArgs {
  if (draft.kind === "concept") {
    return { p_artifact_id: artifact.id, p_text: draft.text };
  }
  const title = artifact.title.replace(/^תסריט\s*·\s*/, "");
  return {
    p_artifact_id: artifact.id,
    p_text: scriptText({ title, beats: draft.beats }),
    p_beats: draft.beats.map(({ narration, on_screen, visual }) => ({
      narration,
      on_screen,
      visual,
    })),
  };
}

/** The chat line the board's approve button sends; the server saves it as the brief's concept. */
export const approveConceptLine = (artifact: WorkshopArtifact) =>
  `${CONCEPT_LABEL}: ${tapTitle(artifact.title)}`;

/**
 * Beats whose narration runs past their time at the voice-over pace the save tool checks
 * (save-script.ts), as the message the form shows under each; an empty map when all fit.
 */
export function overlongBeats(beats: Array<ScriptBeat>): Map<number, string> {
  const overlong = new Map<number, string>();
  beats.forEach((beat, index) => {
    const seconds = beat.end_s - beat.start_s;
    const words = spokenWords(beat.narration);
    if (words > maxWords(seconds)) {
      overlong.set(
        index,
        `${words} מילים לא נכנסות ב-${seconds} שניות (עד ${maxWords(seconds)}). כדאי לקצר.`,
      );
    }
  });
  return overlong;
}

/** A stored beat is a JSON object (meta.beats comes from the database untyped). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
