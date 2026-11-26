import type { RunState } from "./state.ts";
import { openDeviceTurn } from "../device-turn/turn.ts";
import { readPictureRequest } from "../attachments/picture-request.ts";

/** Resolves device continuation before parsing pictures or attempting the fast lane. */
export async function openRunDeviceTurn(
  run: RunState,
): Promise<Response | undefined> {
  run.deviceTurn = await openDeviceTurn(run.supabase, run.input.emit, {
    body: run.input.bodyJson,
    authKind: run.input.request.authKind,
    surface: run.input.surface,
    isCarmen: run.isCarmenAgent,
    pinSkillsOnly: run.pinSkillsOnly,
    inWorkshop: run.inWorkshopRequest,
    automationRun: run.automationRun,
    taskMode: run.task_mode,
    pickedBrain: Boolean(run.input.brainEngine),
    agentEngine: run.modelOverride || run.agent.engine,
    tenantId: run.resolvedTenantId,
    userId: run.callerUserId,
    conversationId: run.serverConversationId,
  });
  if (run.deviceTurn.reply) {
    return run.deviceTurn.reply;
  }
  run.pictureRequest = readPictureRequest(run.input.bodyJson.attachments, {
    authKind: run.input.request.authKind,
    userId: run.callerUserId,
  });
}
