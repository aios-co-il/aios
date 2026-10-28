import { settleProduction } from "./budget.ts";

// A production's render pays for the trailer sound effects (render-worker jobs/render.mjs
// costUsd); every other render records 0.
const WORKER_KINDS = ["clip", "voice", "music", "lipsync", "render"];
const IN_FLIGHT = new Set(["queued", "running"]);

/**
 * The film's real charges, as the render worker recorded them on its runs, count against the
 * project budget instead of the quote the user approved.
 */
export async function settleFromRuns(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const { data } = await supabase
      .from("marketing_runs")
      .select("kind, status, cost_usd")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .in("kind", WORKER_KINDS);
    const runs = Array.isArray(data) ? data : [];
    if (runs.length === 0) return payload;
    return settleProduction(payload, {
      usd: runs.reduce((sum, run) => sum + (Number(run.cost_usd) || 0), 0),
      inFlight: runs.some((run) => IN_FLIGHT.has(String(run.status))),
    });
  } catch {
    return payload;
  }
}
