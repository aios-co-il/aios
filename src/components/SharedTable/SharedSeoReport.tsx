import { useState } from "react";
import { ChevronLeft, FileText, Globe } from "lucide-react";
import { PublicSeoMonthlyWorkView } from "@/components/dynamic-tables/PublicSeoMonthlyWorkView";
import { computeGaOrganicByMonth } from "@/components/dynamic-tables/seo/computeGaOrganicByMonth";
import { ReportHeader } from "@/components/reports/ReportHeader/ReportHeader";
import { Button } from "@/components/ui/button";
import { parseSharedReportTabs } from "@/lib/sharedReportTabs";
import { AhrefsSharedReportTabs } from "./AhrefsSharedReportTabs";
import type { SharedTableInfo, SharedTablePayload } from "./publicTableApi";
import { sharedGscKeywords } from "./sharedGscKeywords";

type Props = {
  data: SharedTablePayload;
  table: SharedTableInfo;
  /** Search Console still loading in its follow-up request. */
  gscLoading: boolean;
  /** The send capture: no monthly-work button, ready once Search Console is in. */
  summaryOnly?: boolean;
};

/** An SEO (Ahrefs) share: the SEO dashboard with the GSC, GA and calls tabs the share dialog left on. */
export function SharedSeoReport({
  data,
  table,
  gscLoading,
  summaryOnly = false,
}: Props) {
  const [monthlyWorkFullPage, setMonthlyWorkFullPage] = useState(false);
  const settings = table.integration_settings || {};
  const gaRecords = data.ga_records || [];
  const gscRecords = data.gsc_records || [];
  const maskyooPeriod = data.maskyoo_period || null;
  const sharedTabs = parseSharedReportTabs(table.integration_settings);
  const hasGa = gaRecords.length > 0 && sharedTabs.ga;
  const hasGsc = gscRecords.length > 0 && sharedTabs.gsc;
  const seoMonthly = data.seo_monthly || null;
  const monthlyWork = sharedTabs.monthly_work ? (seoMonthly?.months ?? []) : [];
  const relevance = data.seo_keyword_relevance;

  // The monthly work report opens as its own page, so the client reads it
  // without the dashboard chrome around it.
  if (monthlyWorkFullPage) {
    return (
      <PublicSeoMonthlyWorkView
        fullPage
        onBack={() => setMonthlyWorkFullPage(false)}
        clientName={seoMonthly?.client_name || table.name}
        domain={
          seoMonthly?.domain ||
          (typeof settings.targetDomain === "string"
            ? settings.targetDomain
            : null)
        }
        months={monthlyWork}
        shareToken={seoMonthly?.share_token || null}
        ahrefsReports={data.ahrefs_reports || []}
        forceRelevant={relevance?.force_relevant || []}
        forceIrrelevant={relevance?.force_irrelevant || []}
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-background"
      dir="rtl"
      data-snapshot-ready={gscLoading ? "false" : "true"}
    >
      <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <ReportHeader
          title={table.name}
          badges={<Globe className="h-4 w-4 text-primary" />}
        />

        {monthlyWork.length > 0 && !summaryOnly && (
          <Button
            type="button"
            onClick={() => {
              setMonthlyWorkFullPage(true);
              window.scrollTo({ top: 0 });
            }}
            className="h-auto w-full justify-between gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 sm:px-7 sm:py-5"
          >
            <span className="flex items-center gap-3 text-right">
              <FileText className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
              <span className="flex flex-col">
                <span className="text-base font-bold leading-tight sm:text-xl">
                  דוח עבודה שנעשתה
                </span>
                <span className="text-xs font-normal text-emerald-50 sm:text-sm">
                  כל מה שקודם באתר החודש — תוכן, קישורים ושיפורים
                </span>
              </span>
            </span>
            <ChevronLeft className="h-6 w-6 shrink-0" />
          </Button>
        )}

        <AhrefsSharedReportTabs
          hasGsc={hasGsc}
          hasGa={hasGa}
          gscPending={gscLoading && !hasGsc && sharedTabs.gsc}
          gscRecords={gscRecords}
          gaRecords={gaRecords}
          gscAggregated={hasGsc ? sharedGscKeywords(gscRecords) : []}
          gaOrganicByMonth={computeGaOrganicByMonth(gaRecords)}
          maskyooSnapshots={data.maskyoo_snapshots || []}
          periodLabel={
            maskyooPeriod
              ? `${maskyooPeriod.start} – ${maskyooPeriod.end}`
              : undefined
          }
          tableName={table.name}
          tableSettings={settings}
          clientId={table.client_id || null}
          ahrefsReports={data.ahrefs_reports || []}
          gscMultiPeriod={data.gsc_multi_period || null}
          seoKeywordRelevance={relevance}
          sharedTabs={sharedTabs}
        />
        {summaryOnly && <div data-snapshot-end="true" aria-hidden="true" />}
      </div>
    </div>
  );
}
