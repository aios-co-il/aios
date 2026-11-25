import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { useModuleSidePanel } from "@/components/shared/ModuleSidePanel/moduleSidePanelContext";
import { ModuleSidePanelItem } from "@/components/shared/ModuleSidePanel/ModuleSidePanelItem";
import { TasksPeriodNav } from "./TasksPeriodNav";

/**
 * Previous / today / next in the side panel: the usual row while open, and
 * three icons stacked from previous to next while collapsed.
 */
export function TasksPanelPeriodNav({
  onPrev,
  onNext,
  onToday,
}: {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const { collapsed } = useModuleSidePanel();

  if (!collapsed) {
    return (
      <div className="flex justify-center">
        <TasksPeriodNav onPrev={onPrev} onNext={onNext} onToday={onToday} />
      </div>
    );
  }

  return (
    <>
      <ModuleSidePanelItem icon={ChevronRight} label="הקודם" onClick={onPrev} />
      <ModuleSidePanelItem icon={CalendarDays} label="היום" onClick={onToday} />
      <ModuleSidePanelItem icon={ChevronLeft} label="הבא" onClick={onNext} />
    </>
  );
}
