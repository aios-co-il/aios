import { type ReactElement, useState } from "react";
import { ReportNameCell } from "@/components/report-ui/ReportTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  name: string;
  /** Paused, removed or its report switched off. */
  off: boolean;
  /** What the dialog says the preview shows, under the name. */
  description: string;
  /** The platform's preview, or null when the row has none: the name is then plain. */
  preview: ReactElement | null;
};

/**
 * The name cell of an ads report row whose name can open its preview, on the
 * internal report and its share link. Each platform's cell decides only
 * whether the row has a preview and what it is: Meta's preview frame for a
 * Facebook ad, the drawn card for a Google ad. The preview is mounted only
 * while the dialog is open.
 */
export function PreviewableNameCell({
  name,
  off,
  description,
  preview,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ReportNameCell
        name={name}
        on={!off}
        className="p-2 text-right"
        onNameClick={preview ? () => setOpen(true) : undefined}
      />
      {preview && (
        <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="truncate" title={name}>
                {name}
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {preview}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
