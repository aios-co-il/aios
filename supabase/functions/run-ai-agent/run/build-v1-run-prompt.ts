import { initializeV1RunPrompt } from "./initialize-v1-run-prompt.ts";
import { appendV1TaskPrompts } from "./append-v1-task-prompts.ts";
import { appendV1AgentSpecialties } from "./append-v1-agent-specialties.ts";
import { appendV1ProceduralSkills } from "./append-v1-procedural-skills.ts";
import { appendV1Presentation } from "./append-v1-presentation.ts";
import { appendV1RecallAndLead } from "./append-v1-recall-and-lead.ts";
import type { RunState } from "./state.ts";
/** Builds the legacy prompt in its original sequence. */
export async function buildV1RunPrompt(run: RunState): Promise<void> {
  initializeV1RunPrompt(run);
  appendV1TaskPrompts(run);
  appendV1AgentSpecialties(run);
  await appendV1ProceduralSkills(run);
  appendV1Presentation(run);
  await appendV1RecallAndLead(run);
}
