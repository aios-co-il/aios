import type { LeadStatusRow } from "../_shared/automation-delay/status-guard.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { postResume } from "./post-resume.ts";
import type { ResumeDeps } from "./resume-run.ts";

/** The database reads and the trigger-automation call a resume needs. */
export function resumeDeps(supabase: DbClient): ResumeDeps {
  return {
    async automationIsActive(automationId) {
      const { data, error } = await supabase
        .from("automations")
        .select("active")
        .eq("id", automationId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data?.active === true;
    },
    async delayStepExists(automationId, stepId) {
      const { data, error } = await supabase
        .from("automation_flow_steps")
        .select("id")
        .eq("automation_id", automationId)
        .eq("id", stepId)
        .eq("step_type", "delay")
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data !== null;
    },
    async leadStatus(tenantId, leadId): Promise<LeadStatusRow | null> {
      const { data, error } = await supabase
        .from("leads")
        .select("status, response_status")
        .eq("tenant_id", tenantId)
        .eq("id", leadId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    },
    runStepsAfterDelay: postResume,
  };
}
