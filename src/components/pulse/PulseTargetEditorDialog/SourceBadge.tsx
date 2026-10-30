import { Badge } from "@/components/ui/badge";
import {
  pulseTargetSourceLabel,
  type PulseTarget,
} from "../../../../supabase/functions/_shared/pulse/targets/kinds.ts";

/** Who set the shown target ("אין יעד" when none); Carmen's rationale on hover. */
export function SourceBadge({ target }: { target: PulseTarget | null }) {
  if (!target) {
    return (
      <Badge variant="outline" className="text-[10px]">
        אין יעד
      </Badge>
    );
  }
  const market = target.source === "carmen_market";
  return (
    <Badge
      variant={market ? "secondary" : "default"}
      className="text-[10px] whitespace-nowrap"
      title={market && target.rationale ? target.rationale : undefined}
    >
      {pulseTargetSourceLabel(target.source)}
    </Badge>
  );
}
