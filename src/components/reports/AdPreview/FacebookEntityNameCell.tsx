import { useState } from "react";
import { ReportNameCell } from "@/components/report-ui/ReportTable";
import { AdPreviewDialog } from "./AdPreviewDialog";
import { useAdPreviewSource } from "./AdPreviewContext";
import { FacebookAdPreviewFrame } from "./FacebookAdPreviewFrame";

type Props = {
  name: string;
  /** Paused, removed or its report switched off. */
  off: boolean;
  /** The Meta ad id of an ad-level row; other rows have none. */
  adId?: string | null;
};

/**
 * The name cell of a Facebook report row. An ad row's name opens the ad's
 * preview where the report has a preview source (the internal page and its
 * share link); every other row is the plain name cell.
 */
export function FacebookEntityNameCell({ name, off, adId }: Props) {
  const source = useAdPreviewSource();
  const [open, setOpen] = useState(false);
  const previewable = source && adId;

  return (
    <>
      <ReportNameCell
        name={name}
        on={!off}
        className="p-2 text-right"
        onNameClick={previewable ? () => setOpen(true) : undefined}
      />
      {previewable && (
        <AdPreviewDialog
          open={open}
          adName={name}
          description="תצוגה מקדימה של המודעה בפיד במובייל"
          onClose={() => setOpen(false)}
        >
          <FacebookAdPreviewFrame source={source} adId={adId} adName={name} />
        </AdPreviewDialog>
      )}
    </>
  );
}
