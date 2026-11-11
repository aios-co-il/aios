import { useMemo } from "react";
import { AlertTriangle, Rocket, Smile, Users } from "lucide-react";
import { StatChip } from "@/components/report-ui/StatChip";
import { clientsKpisOf, shareOf } from "./clientsKpis";

/**
 * The headline figures as chips in the toolbar, counted from the clients the
 * viewer may see (role and agency scope), before the list filters narrow them.
 */
export function ClientsKpiChips({
  clients,
}: {
  clients: ReadonlyArray<{ status: string; mood_status?: string | null }>;
}) {
  const kpis = useMemo(() => clientsKpisOf(clients), [clients]);
  const happyShare = shareOf(kpis.happy, kpis.current);
  // Phones skip the chips so the bar stays one row above the list.
  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      <StatChip
        icon={Users}
        value={kpis.active}
        label="פעילים"
        title={`מתוך ${clients.length} לקוחות`}
      />
      <StatChip
        icon={Rocket}
        value={kpis.onboarding}
        label="בקליטה"
        title="לקוחות חדשים בתהליך"
      />
      <StatChip
        icon={Smile}
        value={happyShare === null ? "—" : `${happyShare}%`}
        label="מבסוטים"
        title={`${kpis.happy} מתוך ${kpis.current} פעילים`}
      />
      <StatChip
        icon={AlertTriangle}
        value={kpis.atRisk}
        label="דורשים תשומת לב"
        title={`בסיכון או לא מתקדמים · ${kpis.wavering} מתנדנדים`}
        tone={kpis.atRisk > 0 ? "danger" : "plain"}
      />
    </div>
  );
}
