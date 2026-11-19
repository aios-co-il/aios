import type { PausedRun } from "./resume-run.ts";

/** The fields automation-delay-worker reads from trigger-automation's answer. */
type TriggerAutomationReply = {
  error?: string;
  results?: Array<{
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    error?: string;
  } | null>;
};

/**
 * Asks trigger-automation, with the service key, to run the steps after the
 * run's delay step. The request names no trigger type: trigger-automation
 * handles some types (task notifications) before it reaches a flow, and a
 * resume must only continue the flow. Resolves with a skip reason, or null when the steps ran;
 * throws when the call or a step failed.
 */
export async function postResume(run: PausedRun): Promise<string | null> {
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/trigger-automation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        automationId: run.automation_id,
        tenant_id: run.tenant_id,
        data: run.payload,
        _resume_delay_step_id: run.delay_step_id,
      }),
    },
  );
  const reply: TriggerAutomationReply = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      reply.error || `trigger-automation returned ${response.status}`,
    );
  }
  const result = reply.results?.[0];
  if (!result) {
    return "conditions_not_met";
  }
  if (result.skipped) {
    return result.reason || "skipped";
  }
  if (result.success !== true) {
    throw new Error(result.error || "a step after the delay failed");
  }
  return null;
}
