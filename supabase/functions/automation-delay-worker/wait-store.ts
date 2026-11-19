import type { DbClient } from "../_shared/supabase-clients.ts";
import type { WaitStore } from "./drain.ts";

/** The most due waits one call lists; the next call, a minute later, takes the rest. */
const MAX_DUE_PER_CALL = 200;

/** The statements a worker call makes on automation_delayed_runs. */
export function waitStore(supabase: DbClient): WaitStore {
  return {
    // Waits of every org are listed here; each is then handled under its own tenant_id.
    async dueRunIds() {
      const { data, error } = await supabase
        .from("automation_delayed_runs")
        .select("id")
        .eq("status", "waiting")
        .lte("resume_at", new Date().toISOString())
        .order("resume_at", { ascending: true })
        .limit(MAX_DUE_PER_CALL);
      if (error) {
        throw error;
      }
      return data.map((wait) => wait.id);
    },
    // The update matches only a row still `waiting`, so one worker owns the claim.
    async claim(id) {
      const { data, error } = await supabase
        .from("automation_delayed_runs")
        .update({ status: "resuming", claimed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "waiting")
        .select(
          "id, tenant_id, automation_id, delay_step_id, payload, status_guard",
        )
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    },
    async record(run, result) {
      if (result.status === "failed") {
        console.error(
          `[automation-delay-worker] resume ${run.id} failed:`,
          result.outcome,
        );
      }
      const { error } = await supabase
        .from("automation_delayed_runs")
        .update({
          status: result.status,
          outcome: result.outcome,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id)
        .eq("tenant_id", run.tenant_id);
      if (error) {
        throw error;
      }
    },
  };
}
