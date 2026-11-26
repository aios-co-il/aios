import { withDevicePictures } from "../attachments/turn-pictures.ts";
import { commandCenterScreenshotStore } from "../device-turn/screenshot.ts";
import type { RunState } from "./state.ts";
import { openDeviceTurn } from "../device-turn/turn.ts";
import { readPictureRequest } from "../attachments/picture-request.ts";
import { pictureCallerOf } from "./picture-caller.ts";

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
    screenshotStore: commandCenterScreenshotStore(run.supabase),
  });
  if (run.deviceTurn.reply) {
    return run.deviceTurn.reply;
  }
  run.pictureRequest = withDevicePictures(
    readPictureRequest(run.input.bodyJson.attachments, pictureCallerOf(run)),
    run.deviceTurn.pictures,
  );
}
