import type { ReactNode } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  syncLabel: string;
  syncing: boolean;
  /** The sources to sync are still loading. */
  syncDisabled?: boolean;
  onSync: () => void;
  exporting: boolean;
  onExportPdf: () => void;
  /** The live report has no share token yet, so there is nothing to export. */
  disabled: boolean;
  /** Further buttons, such as the ad account and the internal report. */
  children?: ReactNode;
};

/** The row under the live report: sync its sources and export it as a PDF. */
export function ReportCardActions({
  syncLabel,
  syncing,
  syncDisabled = false,
  onSync,
  exporting,
  onExportPdf,
  disabled,
  children,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1 text-xs"
        onClick={onSync}
        disabled={syncing || syncDisabled || disabled}
      >
        <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "מסנכרן..." : syncLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1 text-xs"
        onClick={onExportPdf}
        disabled={exporting || disabled}
      >
        {exporting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        יצוא PDF
      </Button>
      {children}
    </div>
  );
}
