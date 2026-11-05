import type { PulseTargetDb, PulseTargetToolContext } from "./context.ts";
import { getPulseTargets } from "./get-pulse-targets.ts";
import { requestApprovedTarget } from "./request-approved-target.ts";
import { setMarketTarget } from "./set-market-target.ts";

/** Runs one pulse-target tool call; run-ai-agent only registers and dispatches. */
export async function executePulseTargetTool(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  name: string,
  args: Record<string, unknown>,
) {
  if (name === "get_pulse_targets") {
    return await getPulseTargets(db, ctx, args);
  }
  if (name === "set_market_target") {
    return await setMarketTarget(db, ctx, args);
  }
  if (name === "set_pulse_target") {
    return await requestApprovedTarget(db, ctx, args);
  }
  return { error: "כלי לא מוכר" };
}
