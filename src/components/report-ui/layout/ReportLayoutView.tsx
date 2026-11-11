import {
  LayoutDashboard,
  MousePointerClick,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReportData } from "../data/reportData";
import type { ReportScope } from "../metrics/reportMetricTypes";
import type { ReportLayout, ReportLayoutSection } from "./reportLayout";
import { ReportWidgetRun } from "./ReportWidgetRun";
import { isWidgetVisible, widgetRuns } from "./widgetVisibility";

const SCOPE_HEADINGS: Record<ReportScope, { title: string; icon: LucideIcon }> =
  {
    all: { title: "כל הקמפיינים", icon: LayoutDashboard },
    ecommerce: { title: "מכירות", icon: ShoppingBag },
    leads: { title: "לידים", icon: Users },
    traffic: { title: "תנועה", icon: MousePointerClick },
  };

interface ReportLayoutViewProps {
  layout: ReportLayout;
  data: ReportData;
}

/**
 * A report drawn from its layout: each section over its scope's data, each
 * widget with the metric keys the layout gives it. Sections without data and
 * widgets with nothing to show are left out.
 */
export function ReportLayoutView({ layout, data }: ReportLayoutViewProps) {
  const sections = layout.sections.filter(
    (section) => data.scopes[section.scope],
  );
  return (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <LayoutSection
          key={`${section.scope}-${index}`}
          section={section}
          data={data}
          showHeading={index === 0 || section.scope !== "all"}
        />
      ))}
    </div>
  );
}

/** One section: its heading, then its visible widgets in runs. */
function LayoutSection({
  section,
  data,
  showHeading,
}: {
  section: ReportLayoutSection;
  data: ReportData;
  showHeading: boolean;
}) {
  const scope = data.scopes[section.scope];
  if (!scope) {
    return null;
  }
  const widgets = section.widgets.filter((widget) =>
    isWidgetVisible(widget, scope, data),
  );
  if (widgets.length === 0) {
    return null;
  }
  const heading = SCOPE_HEADINGS[section.scope];
  return (
    <section className="space-y-3">
      {showHeading && (
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <heading.icon
            className="h-5 w-5 text-brand-accent"
            aria-hidden="true"
          />
          {heading.title}
        </h3>
      )}
      {widgetRuns(widgets).map((run) => (
        <ReportWidgetRun
          key={run[0].id}
          run={run}
          scopeName={section.scope}
          scope={scope}
          data={data}
        />
      ))}
    </section>
  );
}
