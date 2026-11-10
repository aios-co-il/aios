import { Loader2, Send, Square } from "lucide-react";
import { ThinkingGalaxy } from "./ThinkingGalaxy";

/**
 * The composer's main button: send when there is text; while Carmen answers with nothing typed,
 * stop her. A message typed while she answers is queued and sent when she finishes.
 */
export function SendOrStopButton({
  busy,
  canSend,
  disabled,
  stopping,
  queued,
  onSend,
  onStop,
}: {
  busy: boolean;
  canSend: boolean;
  disabled: boolean;
  stopping: boolean;
  queued: number;
  onSend: () => void;
  onStop: () => void;
}) {
  const stopMode = busy && !canSend;
  const title = stopMode
    ? stopping
      ? "עוצרת…"
      : "עצירה"
    : busy
      ? "תישלח כשכרמן תסיים"
      : "שליחה";
  return (
    <div className="relative order-5 shrink-0 sm:order-none">
      <button
        onClick={stopMode ? onStop : onSend}
        disabled={stopMode ? stopping : disabled || !canSend}
        className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--cc-accent-dim)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        title={title}
        aria-label={title}
      >
        {stopMode ? (
          stopping ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4" />
          )
        ) : busy ? (
          <ThinkingGalaxy size="sm" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
      {queued > 0 && (
        <span
          className="absolute -top-1.5 -left-1.5 rounded-full bg-[var(--cc-accent)] px-1.5 text-[10px] text-white"
          title="הודעות שממתינות לשליחה"
        >
          {queued}
        </span>
      )}
    </div>
  );
}
