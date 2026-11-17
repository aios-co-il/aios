import { Settings2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import { ReportSection } from "@/components/report-ui/ReportSection";
import type { EventUsersResult } from "../../../../supabase/functions/ga-event-users/reports.ts";
import { EventUsersTable } from "./EventUsersTable";
import { SiteKpiCards } from "./SiteKpiCards";
import type { RatioFigures } from "./siteKpis";
import { TrackedEventsChart } from "./TrackedEventsChart";
import type { TrackedEventsSummary } from "./trackedEvents";

/** The live GA people-per-source answer and its loading state. */
export type EventUsersState = {
  result: EventUsersResult | undefined;
  loading: boolean;
  failed: boolean;
};

type Props = {
  summary: TrackedEventsSummary;
  /** Purchase revenue for the period; zero hides its card. */
  revenue?: number;
  /** The chosen conversion pair's figures, if the dashboard names one. */
  ratio?: RatioFigures | null;
  /** People per event and source from GA; left out when not asked for. */
  eventUsers?: EventUsersState;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  /** Opens the event picker; the shared dashboard leaves it out. */
  onEdit?: () => void;
};

/**
 * The site goals at the top of a dashboard's Analytics tab: purchase revenue
 * and the chosen conversion, a card per followed site event with its count
 * and cost per event, the people who did each by traffic source with the
 * conversion between steps, and a daily chart. Without followed events it
 * offers the picker where the dashboard is editable and shows nothing on a
 * share link.
 */
export function TrackedEventsTab({
  summary,
  revenue = 0,
  ratio = null,
  eventUsers,
  formatCurrency,
  formatNumber,
  onEdit,
}: Props) {
  const editButton = onEdit && (
    <Button variant="outline" size="sm" onClick={onEdit}>
      <Settings2 className="ml-2 h-4 w-4" />
      {summary.events.length === 0 ? "בחירת אירועים" : "עריכת אירועים"}
    </Button>
  );
  if (summary.events.length === 0) {
    return editButton ? (
      <ReportSection
        title="יעדים באתר"
        icon={Target}
        description="בחרו אירועים מ-Google Analytics כדי לעקוב אחריהם כיעדים בראש הדוח"
        actions={editButton}
      >
        {null}
      </ReportSection>
    ) : null;
  }
  return (
    <div className="space-y-4">
      <ReportSection title="יעדים באתר" icon={Target} actions={editButton}>
        <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <SiteKpiCards
            revenue={revenue}
            ratio={ratio}
            formatCurrency={formatCurrency}
            formatNumber={formatNumber}
          />
          {summary.events.map((item) => (
            <ReportKpiCard
              key={item.event}
              icon={Target}
              label={item.label}
              value={formatNumber(item.count)}
              hint={
                item.cost === null
                  ? "עלות לאירוע: -"
                  : `עלות לאירוע: ${formatCurrency(item.cost)}`
              }
            />
          ))}
        </div>
      </ReportSection>
      {eventUsers && (
        <EventUsersTable {...eventUsers} formatNumber={formatNumber} />
      )}
      <TrackedEventsChart events={summary.events} days={summary.days} />
    </div>
  );
}
