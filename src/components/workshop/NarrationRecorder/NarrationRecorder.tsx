import { useState } from "react";
import { Loader2, Mic, RotateCcw, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { prefillComposer } from "@/lib/workshopBridge";
import {
  GUIDE_MAX_SECONDS,
  guideLine,
} from "@functions/_shared/workshop/narration-guide.ts";
import type { StoryboardScene } from "../storyboardScenes";
import { clockOf, narrationScript } from "./recording";
import { useNarrationRecorder } from "./useNarrationRecorder";
import {
  type GuideTarget,
  type SendGuideRecording,
  useSendGuideRecording,
} from "./useSendGuideRecording";

export interface NarrationRecorderProps extends GuideTarget {
  /** The storyboard, whose narration the user reads aloud. */
  scenes: Array<StoryboardScene>;
  /** Opens Carmen's chat, where the recording's line is put for the user to send. */
  openChat?: () => void;
}

/**
 * The narration page's "הקלטה בקול שלי": the user reads the narration aloud, listens back, and
 * sends it; Carmen keeps the recording's delivery and changes only the voice to the project's
 * narrator (narration-guide.ts). Sending uploads the file and puts its line in Carmen's chat.
 * The upload lives here, not in the dialog, and the dialog cannot be closed while it runs, so the
 * line always reaches the chat once the file is stored.
 */
export function NarrationRecorder({
  scenes,
  openChat,
  ...target
}: NarrationRecorderProps) {
  const [open, setOpen] = useState(false);
  const send = useSendGuideRecording(target, (path) => {
    setOpen(false);
    openChat?.();
    prefillComposer(`${guideLine(path)}\n`);
  });
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Mic className="h-3 w-3" />
        הקלטה בקול שלי
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || !send.isPending) {
            // A failed send stays on the mutation, which outlives the panel: clear it so a reopened
            // recorder does not show the old error.
            if (!next) {
              send.reset();
            }
            setOpen(next);
          }
        }}
      >
        {open ? <RecorderPanel scenes={scenes} send={send} /> : null}
      </Dialog>
    </>
  );
}

/** The dialog's content: the script, the recorder's controls and the send button. */
function RecorderPanel({
  scenes,
  send,
}: {
  scenes: Array<StoryboardScene>;
  send: SendGuideRecording;
}) {
  const recorder = useNarrationRecorder(GUIDE_MAX_SECONDS);
  const script = narrationScript(scenes);
  const sendRecording = () => {
    if (recorder.recording) {
      send.mutate(recorder.recording);
    }
  };
  return (
    <DialogContent
      dir="rtl"
      className="max-w-lg text-right"
      // The page under the dialog selects itself on a click; the dialog's clicks are its own.
      onClick={(event) => event.stopPropagation()}
    >
      <DialogHeader className="text-right sm:text-right">
        <DialogTitle>הקלטה בקול שלי</DialogTitle>
        <DialogDescription>
          קראו את הקריינות בקצב ובהגייה שאתם רוצים. כרמן תשמור עליהם ותחליף רק
          את הקול לקול שנבחר לסרט.
        </DialogDescription>
      </DialogHeader>
      <p className="max-h-48 overflow-y-auto whitespace-pre-line rounded-xl bg-muted/50 p-3 text-base leading-relaxed">
        {script || "אין עדיין קריינות בסצנות."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {recorder.state === "recording" ? (
          <Button type="button" variant="destructive" onClick={recorder.stop}>
            <Square className="h-4 w-4" />
            עצירה ({clockOf(recorder.seconds)} / {clockOf(GUIDE_MAX_SECONDS)})
          </Button>
        ) : recorder.state === "recorded" ? (
          <Button
            type="button"
            variant="outline"
            // Not while sending: the sent take would close the dialog and drop the new one.
            disabled={send.isPending}
            onClick={() => {
              send.reset();
              recorder.reset();
            }}
          >
            <RotateCcw className="h-4 w-4" />
            הקלטה מחדש
          </Button>
        ) : (
          <Button type="button" onClick={recorder.start} disabled={!script}>
            <Mic className="h-4 w-4" />
            התחלת הקלטה
          </Button>
        )}
        {recorder.state === "recorded" ? (
          <Button
            type="button"
            onClick={sendRecording}
            disabled={send.isPending}
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            שליחה לכרמן
          </Button>
        ) : null}
      </div>
      {recorder.recording ? (
        <audio src={recorder.recording.url} controls className="w-full" />
      ) : null}
      {recorder.error || send.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {recorder.error ?? "ההקלטה לא נשלחה. נסו שוב."}
        </p>
      ) : null}
    </DialogContent>
  );
}
