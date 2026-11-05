import { Sparkles, TriangleAlert } from "lucide-react";
import { MagicShimmer } from "./MagicShimmer";
import {
  artifactText,
  fallbackNote,
  pageTypeFor,
  type WorkshopArtifact,
} from "./workshopFeedModel";

const WAIT_NOTE_MIN = 5;

const waitedMinutes = (artifact: WorkshopArtifact) =>
  (Date.now() - Date.parse(artifact.created_at)) / 60_000;

/** One board page as the user sees it: a picture, a film, a sound, the brief or text. */
export function PageBody({
  artifact,
  format,
}: {
  artifact: WorkshopArtifact;
  format: string;
}) {
  const type = pageTypeFor(artifact);
  if (artifact.status === "pending") {
    return (
      <MagicShimmer
        format={artifact.kind === "film" ? "9:16" : format}
        label={
          artifact.kind === "film" && waitedMinutes(artifact) >= WAIT_NOTE_MIN
            ? "ההפקה ממתינה כבר זמן רב. אם זה לא זז, שרת ההפקה כנראה לא מחובר לסביבה הזו"
            : "כרמן עובדת על זה"
        }
        className="rounded-none"
      />
    );
  }
  if (artifact.status === "failed") {
    return (
      <div className="flex h-40 items-center justify-center gap-2 px-4 text-center text-sm text-destructive">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        {artifactText(artifact) || "היצירה נכשלה"}
      </div>
    );
  }
  if (type === "image" && artifact.url) {
    return (
      <img
        src={artifact.url}
        alt={artifact.title}
        className="mx-auto max-h-[72vh] w-auto max-w-full object-contain"
      />
    );
  }
  if (type === "video" && artifact.url) {
    const note = fallbackNote(artifact);
    return (
      <>
        <video
          src={artifact.url}
          controls
          playsInline
          className="mx-auto max-h-[72vh] w-full bg-black"
        />
        {note ? (
          <p className="flex items-center gap-1.5 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlert className="h-3 w-3 shrink-0" />
            {note}
          </p>
        ) : null}
      </>
    );
  }
  if (type === "audio" && artifact.url) {
    return (
      <div className="p-4">
        <audio src={artifact.url} controls className="w-full" />
      </div>
    );
  }
  if (type === "brief") {
    const summary = String(artifact.meta.summary ?? "");
    const brief = String(artifact.meta.brief ?? "");
    return (
      <div className="space-y-2 p-5">
        {summary ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/10 px-3 py-1 text-xs font-medium text-pink-700 dark:text-pink-300">
            <Sparkles className="h-3 w-3" />
            {summary}
          </p>
        ) : null}
        {brief ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{brief}</p>
        ) : null}
      </div>
    );
  }
  return (
    <p className="whitespace-pre-wrap p-5 text-sm leading-relaxed">
      {artifactText(artifact) || artifact.title}
    </p>
  );
}
