import { useState } from "react";
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
  const card = useClientReportCard({
    target: { kind: "dashboard", id: dashboard.id, name: dashboard.name },
    clientId,
    tenantId,
    shareSource: dashboardShareSource(dashboard, tenantId),
    buildShareUrl: buildSharedDashboardUrl,
    captureImage: captureDashboardImage,
  });
  const { token } = card.share;
  const sync = useDashboardSync(clientId, tenantId, token);

  return (
    <div className="space-y-3 min-w-0" dir="rtl">
      <LiveReportFrame
        share={card.share}
        busyLabel={sync.syncing ? "מסנכרן מקורות..." : null}
      >
        {token && (
          <SharedDashboard
            shareTokenOverride={token}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
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
            snapshotMode
          />
        </HiddenCaptureFrame>
      )}
    </div>
  );
}
