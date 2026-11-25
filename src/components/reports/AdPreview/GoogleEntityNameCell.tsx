import { useState } from "react";
import type { GoogleAdContent } from "@functions/sync-google-ads-data/ad-content.ts";
import { ReportNameCell } from "@/components/report-ui/ReportTable";
import { AdPreviewDialog } from "./AdPreviewDialog";
import { GoogleAdCard } from "./GoogleAdCard";

type Props = {
  name: string;
  /** Paused, removed or its report switched off. */
  off: boolean;
  /** The ad's stored copy; null for other rows and ads synced before it was stored. */
  adContent?: GoogleAdContent | null;
};

/**
 * The name cell of a Google Ads report row. An ad row with stored copy opens
 * its card, drawn from the row with no request, so it works the same on the
 * internal report and its share link; every other row is the plain name cell.
 */
export function GoogleEntityNameCell({ name, off, adContent }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ReportNameCell
        name={name}
        on={!off}
        className="p-2 text-right"
        onNameClick={adContent ? () => setOpen(true) : undefined}
      />
      {adContent && (
        <AdPreviewDialog
          open={open}
          adName={name}
          description="תצוגה מקדימה של המודעה בחיפוש Google"
          onClose={() => setOpen(false)}
        >
          <GoogleAdCard content={adContent} />
        </AdPreviewDialog>
      )}
    </>
  );
}
