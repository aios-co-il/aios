import { useMemo } from "react";
import { AlertTriangle, Rocket, Smile, Users } from "lucide-react";
import { ModuleSidePanelStat } from "@/components/shared/ModuleSidePanel/ModuleSidePanelStat";
import { clientsKpisOf, shareOf } from "./clientsKpis";

/**
 * The headline figures as rows in the side panel, counted from the clients the
 * viewer may see (role and agency scope), before the list filters narrow them.
 */
export function ClientsKpiList({
  clients,
}: {
  clients: ReadonlyArray<{ status: string; mood_status?: string | null }>;
}) {
  const kpis = useMemo(() => clientsKpisOf(clients), [clients]);
  const happyShare = shareOf(kpis.happy, kpis.current);
  return (
    <>
      <ModuleSidePanelStat
        icon={Users}
        value={kpis.active}
        label="פעילים"
        title={`מתוך ${clients.length} לקוחות`}
      />
      <ModuleSidePanelStat
        icon={Rocket}
        value={kpis.onboarding}
        label="בקליטה"
        title="לקוחות חדשים בתהליך"
      />
      <ModuleSidePanelStat
        icon={Smile}
        value={happyShare === null ? "—" : `${happyShare}%`}
        label="מבסוטים"
        title={`${kpis.happy} מתוך ${kpis.current} פעילים`}
      />
      <ModuleSidePanelStat
        icon={AlertTriangle}
        value={kpis.atRisk}
        label="דורשים תשומת לב"
        title={`בסיכון או לא מתקדמים · ${kpis.wavering} מתנדנדים`}
        tone={kpis.atRisk > 0 ? "danger" : "plain"}
      />
    </>
  );
}
