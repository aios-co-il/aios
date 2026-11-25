import { type ReactElement, useState } from "react";
import { ReportNameCell } from "@/components/report-ui/ReportTable";
import { AdPreviewDialog } from "./AdPreviewDialog";

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
 * The name cell of an ads report row whose name can open its preview. Each
 * platform's cell decides only whether the row has a preview and what it is.
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
        <AdPreviewDialog
          open={open}
          adName={name}
          description={description}
          onClose={() => setOpen(false)}
        >
          {preview}
        </AdPreviewDialog>
      )}
    </>
  );
}
