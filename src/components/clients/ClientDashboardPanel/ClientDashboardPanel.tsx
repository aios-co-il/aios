import { useState } from "react";
import { format } from "date-fns";
import type { DashboardDateRange } from "@/components/reports/ReportHeader/DashboardDateControls";
import { buildSharedDashboardUrl } from "@/lib/appEnv";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { HiddenCaptureFrame } from "../ClientReportCard/HiddenCaptureFrame";
import { LiveReportFrame } from "../ClientReportCard/LiveReportFrame";
import { ReportCardActions } from "../ClientReportCard/ReportCardActions";
import { SendReportForm } from "../ClientReportCard/SendReportForm";
import { useClientReportCard } from "../ClientReportCard/useClientReportCard";
import { captureDashboardImage } from "./captureDashboardImage";
import {
  type ClientCardDashboard,
  dashboardShareSource,
} from "./dashboardShareToken";
import { useDashboardSync } from "./useDashboardSync";

const SharedDashboard = lazyWithRetry(() => import("@/pages/SharedDashboard"));

type Props = {
  dashboard: ClientCardDashboard;
  clientId: string;
  tenantId: string;
};

/** The window the dashboard opens on, as its share link. */
const DEFAULT_DATE_FILTER = "last_30_days";

/**
 * A client's dashboard in the client card: the share link's dashboard itself,
 * live, with its own dates and comparison. Only a send or a PDF export
 * photographs it, as the dashboard summary at the window picked here.
 */
export function ClientDashboardPanel({ dashboard, clientId, tenantId }: Props) {
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [customDateRange, setCustomDateRange] = useState<DashboardDateRange>(
    {},
  );
  const card = useClientReportCard({
    target: { kind: "dashboard", id: dashboard.id, name: dashboard.name },
    clientId,
    tenantId,
    shareSource: dashboardShareSource(dashboard, tenantId),
    buildShareUrl: buildSharedDashboardUrl,
    captureImage: captureDashboardImage,
  });
  const { token } = card.share;
  const sync = useDashboardSync(clientId, tenantId, token, {
    filter: dateFilter,
    customStart: dayOf(customDateRange.from),
    customEnd: dayOf(customDateRange.to),
  });

  return (
    <div className="space-y-3 min-w-0" dir="rtl">
      <LiveReportFrame
        share={card.share}
        busyLabel={
          sync.progressLabel ?? (sync.syncing ? "מסנכרן מקורות..." : null)
        }
      >
        {token && (
          <SharedDashboard
            shareTokenOverride={token}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            customDateRange={customDateRange}
            onCustomDateRangeChange={setCustomDateRange}
          />
        )}
      </LiveReportFrame>

      <ReportCardActions
        syncLabel="סנכרן את כל המקורות"
        syncing={sync.syncing}
        syncDisabled={sync.loadingTables}
        onSync={sync.sync}
        exporting={card.pdf.exporting}
        onExportPdf={card.pdf.exportPdf}
        disabled={!token}
      />

      <SendReportForm
        form={card.form}
        contacts={card.contacts}
        showSubject={false}
        sendLabel="שלח סיכום"
        phase={card.sender.phase}
        onSend={card.sender.send}
      />

      {card.summary.active && token && (
        <HiddenCaptureFrame nodeRef={card.summary.nodeRef}>
          <SharedDashboard
            shareTokenOverride={token}
            dateFilter={dateFilter}
            customDateRange={customDateRange}
            snapshotMode
          />
        </HiddenCaptureFrame>
      )}
    </div>
  );
}

/** A picked day as yyyy-MM-dd, as the ads sync reads it; null when unpicked. */
function dayOf(day: Date | undefined): string | null {
  return day ? format(day, "yyyy-MM-dd") : null;
}
