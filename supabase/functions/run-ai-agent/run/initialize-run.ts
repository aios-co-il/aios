import type { RunState } from "./state.ts";
import { isWorkshopTurn } from "../workshop-turn-setup.ts";
import { isAutomationRun } from "../approvals/decision-scope.ts";
import { runMayDecideApprovals } from "../approvals/decision-scope.ts";

import { workshopTurnSetup } from "../workshop-turn-setup.ts";
import { ROLE_SKILL } from "../../_shared/workshop/roles.ts";
import { ROLE_PERSONA } from "../../_shared/workshop/roles.ts";
/** initialize Run in the original run order. */
export async function initializeRun(
  run: RunState,
): Promise<Response | string | void> {
  let bodyAgentId, requestedTaskSkills;
  ({
    agent_id: bodyAgentId,
    command_text: run.command_text,
    temperature: run.temperature,
    automation_id: run.automation_id,
    user_name: run.user_name,
    lead_data: run.lead_data,
    tenant_id: run.tenant_id,
    user_id: run.user_id,
    task_skills: requestedTaskSkills,
    task_mode: run.task_mode,
    conversation_history: run.conversation_history,
    conversation_id: run.conversation_id,
    wa_notify: run.wa_notify,
  } = run.input.bodyJson);
  run.inWorkshopRequest = isWorkshopTurn(
    run.input.surface,
    requestedTaskSkills,
  );
  run.task_skills = requestedTaskSkills;
  run.modelOverride =
    typeof run.input.bodyJson.model_override === "string" &&
    run.input.bodyJson.model_override.trim()
      ? run.input.bodyJson.model_override.trim()
      : null;
  run.pinSkillsOnly =
    run.input.bodyJson.pin_skills_only === true &&
    Array.isArray(run.task_skills) &&
    run.task_skills.length > 0;
  run.automationRun = isAutomationRun(run.input.bodyJson);
  run.mayDecideApprovals = runMayDecideApprovals(
    run.input.bodyJson,
    run.input.surface,
  );
  console.log(
    `[AGENT] Starting run: agent=${bodyAgentId}, command="${run.command_text?.substring(0, 80)}", surface=${run.input.surface}, stream=${!!run.input.emit}, pin_skills_only=${run.pinSkillsOnly}`,
  );
  if (!run.command_text) {
    throw new Error("Missing command_text");
  }
  run.supabase = run.dependencies.createClient(
    run.dependencies.SUPABASE_URL,
    run.dependencies.SUPABASE_SERVICE_ROLE_KEY,
  );
  run.turnId = crypto.randomUUID();
  ({
    workshopNote: run.workshopNote,
    workshopRoleForRun: run.workshopRoleForRun,
    workshopMode: run.workshopMode,
  } = run.inWorkshopRequest
    ? await workshopTurnSetup(
        run.supabase,
        run.input.bodyJson,
        run.tenant_id,
        run.command_text,
        run.conversation_history,
        run.turnId,
      )
    : {
        workshopNote: null,
        workshopRoleForRun: null,
        workshopMode: undefined,
      });
  if (run.workshopRoleForRun) {
    run.task_skills = [
      ...(requestedTaskSkills as Array<string>),
      ROLE_SKILL[run.workshopRoleForRun],
    ];
    if (run.input.emit) {
      run.input.emit({
        type: "skin",
        slug: ROLE_PERSONA[run.workshopRoleForRun],
      });
    }
  }
  run.agent_id = bodyAgentId;
}
