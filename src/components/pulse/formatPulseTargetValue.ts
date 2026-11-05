import { formatPulseMoney } from "@/lib/pulseDashboard";
import type { PulseTargetKind } from "../../../supabase/functions/_shared/pulse/targets/kinds.ts";

/** A target or efficiency value: ROAS as a ratio, every cost kind as money. */
export function formatPulseTargetValue(
  kind: PulseTargetKind,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return kind === "roas" ? value.toFixed(2) : formatPulseMoney(value);
}
