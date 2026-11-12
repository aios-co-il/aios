import { useState } from "react";
import { Link2 } from "lucide-react";
import { ReportDataFreshness } from "@/components/reports/ReportDataFreshness";
import type { SharedDateSelection } from "@/components/SharedTable/useSharedTableData";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import {
  getReportLastSyncAt,
  getReportSyncProblem,
} from "@/lib/reportQueryOptions";
import { HiddenCaptureFrame } from "../ClientReportCard/HiddenCaptureFrame";
import { LiveReportFrame } from "../ClientReportCard/LiveReportFrame";
import { ReportCardActions } from "../ClientReportCard/ReportCardActions";
import { SendReportForm } from "../ClientReportCard/SendReportForm";
import { useClientReportCard } from "../ClientReportCard/useClientReportCard";
import { captureReportImage } from "./captureReportImage";
import type { ClientCardTable } from "./clientCardTable";
import { ReportLinkButtons } from "./ReportLinkButtons";
import { buildSharedTableUrl, tableShareSource } from "./tableShareToken";
import { useReportSync } from "./useReportSync";

const SharedTableReport = lazyWithRetry(() =>
  import("@/components/SharedTable/SharedTableReport").then((module) => ({
    default: module.SharedTableReport,
  })),
);

type Props = {
  table: ClientCardTable;
  clientId: string;
  tenantId: string;
};

/**
 * A client's single report in the client card: the share link's report
 * itself, live, with its own dates and comparison. Only a send or a PDF
 * export photographs it, as the report summary at the window picked here.
 */
export function ClientReportPanel({ table, clientId, tenantId }: Props) {
  // The share link's default window.
  const [dates, setDates] = useState<SharedDateSelection>({
    filter: "last_7_days",
  });
  const card = useClientReportCard({
    target: { kind: "table", id: table.id, name: table.name },
    clientId,
    tenantId,
    shareSource: tableShareSource(table, tenantId),
    buildShareUrl: buildSharedTableUrl,
    captureImage: captureReportImage,
  });
  const { token } = card.share;
  const sync = useReportSync(table, tenantId, token);

  return (
    <div className="space-y-3 min-w-0" dir="rtl">
      <ReportDataFreshness
        lastSyncAt={getReportLastSyncAt(table)}
        syncProblem={getReportSyncProblem([table])}
        className="px-1"
      />
      <LiveReportFrame
        ready={!!token}
        failed={card.share.failed}
        busyLabel={sync.syncing ? "מסנכרן נתונים..." : null}
      >
        {token && (
          <SharedTableReport
            shareToken={token}
            dates={dates}
            onDatesChange={setDates}
          />
        )}
      </LiveReportFrame>

      <ReportCardActions
        syncLabel="סנכרן"
        syncing={sync.syncing}
        onSync={sync.sync}
        exporting={card.pdf.exporting}
        onExportPdf={card.pdf.exportPdf}
        disabled={!token}
      >
        <ReportLinkButtons table={table} clientId={clientId} />
      </ReportCardActions>

      <SendReportForm
        form={card.form}
        contacts={card.contacts}
        showSubject
        sendLabel="שלח דוח"
        phase={card.sender.phase}
        onSend={card.sender.send}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link2 className={`h-3 w-3 shrink-0 ${token ? "" : "opacity-50"}`} />
          <span>
            {token ? "קישור צפייה יצורף אוטומטית" : "אין קישור שיתוף פעיל"}
          </span>
        </div>
      </SendReportForm>

      {card.summary.active && token && (
        <HiddenCaptureFrame nodeRef={card.summary.nodeRef}>
          <SharedTableReport shareToken={token} dates={dates} summaryOnly />
        </HiddenCaptureFrame>
      )}
    </div>
  );
}
