import { useMemo } from "react";
import { AlertTriangle, Rocket, Smile, Users } from "lucide-react";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import { cn } from "@/lib/utils";
import { clientsKpisOf, shareOf } from "./clientsKpis";

/**
 * Four headline tiles above the list, counted from the clients the viewer may
 * see (role and agency scope), before the list filters narrow them.
 */
export function ClientsKpiStrip({
  clients,
  className,
}: {
  clients: ReadonlyArray<{ status: string; mood_status?: string | null }>;
  className?: string;
}) {
  const kpis = useMemo(() => clientsKpisOf(clients), [clients]);
  const happyShare = shareOf(kpis.happy, kpis.current);
  return (
    <div
      className={cn(
        "grid shrink-0 auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-4",
        className,
      )}
    >
      <ReportKpiCard
        label="לקוחות פעילים"
        icon={Users}
        value={kpis.active}
        hint={`מתוך ${clients.length} לקוחות`}
      />
      <ReportKpiCard
        label="בקליטה"
        icon={Rocket}
        value={kpis.onboarding}
        hint="לקוחות חדשים בתהליך"
      />
      <ReportKpiCard
        label="לקוחות מבסוטים"
        icon={Smile}
        value={happyShare === null ? "—" : `${happyShare}%`}
        hint={`${kpis.happy} מתוך ${kpis.current} פעילים`}
      />
      <ReportKpiCard
        label="דורשים תשומת לב"
        icon={AlertTriangle}
        value={
          <span className={cn(kpis.atRisk > 0 && "text-destructive")}>
            {kpis.atRisk}
          </span>
        }
        hint={`בסיכון או לא מתקדמים · ${kpis.wavering} מתנדנדים`}
      />
    </div>
  );
}
