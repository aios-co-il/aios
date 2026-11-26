/**
 * Carmen's device steps on one run-ai-agent turn (AIO-686, plan PR 3): what handleRunAgent
 * asks at each point of the turn, so index.ts holds only the calls.
 *
 * A typed message from the extension's panel may be offered `OFFERED_DEVICE_TOOLS`. When the
 * model calls it, `call` writes one pending row and the loop ends the turn with
 * `device_action {action_id, tool}` in the stream and the reply; the site hands the id to
 * the panel, which claims, reads and completes the row (carmen-device-action). The site then
 * sends a continuation with the same run_id: `openDeviceTurn` resumes from the row or answers
 * without the model, and the turn saves only its answer. A typed message also closes every
 * step of its conversation nobody will finish and clears the page text nobody resumed.
 */
import { DEVICE_PAUSE_LINE } from "../../_shared/carmen/device/contract.ts";
import { continuedTurn } from "./continued-turn.ts";
import {
  deviceTurnVerdict,
  offeredDeviceTools,
  serverOrigins,
} from "./eligibility.ts";
import {
  type DeviceTurn,
  deviceTurn,
  type DeviceTurnInput,
  type Emit,
  type OpenTurn,
} from "./model-turn.ts";
import { deviceRequestOf } from "./request.ts";
import type { DeviceDb } from "./rows.ts";
import { settleOpenSteps } from "./settle.ts";

export type { DeviceActionReply } from "../../_shared/carmen/device/contract.ts";
export type { DeviceTurn, DeviceTurnInput } from "./model-turn.ts";

/** Opens the turn's device side: a resumed run, a refused continuation or a typed message. */
export async function openDeviceTurn(
  db: DeviceDb,
  emit: Emit,
  input: DeviceTurnInput,
): Promise<DeviceTurn> {
  const request = deviceRequestOf(input.body);
  const origins = input.origins ?? serverOrigins();
  const now = input.now ?? (() => new Date());
  const verdict = deviceTurnVerdict({
    ...input,
    origins,
    runId: input.body.run_id,
    contextMetadata: input.body.context_metadata,
  });
  const turn = { db, emit, input, origins, now, verdict };

  if (request.continuation) {
    return await continuedTurn(
      turn,
      request.continuation.actionId,
      request.announced,
    );
  }
  await closeUnfinishedSteps(turn);
  return deviceTurn(
    turn,
    // A typed message starts a run, which holds no read whose elements could be named.
    offeredDeviceTools(verdict, request.announced, 0, false),
    null,
  );
}

/** The saved answer of a turn that paused at a step: the model's own text, else the pause line. */
export function devicePauseAnswer(modelText: unknown): string {
  return (
    (typeof modelText === "string" && modelText.trim()) || DEVICE_PAUSE_LINE
  );
}

/**
 * A typed message closes the conversation's steps nobody will finish. A failure is logged
 * and the turn goes on: the steps stay as they were and the next message tries again.
 */
async function closeUnfinishedSteps(turn: OpenTurn): Promise<void> {
  const { input } = turn;
  if (input.authKind !== "user" || !input.userId || !input.conversationId) {
    return;
  }
  try {
    await settleOpenSteps(
      turn.db,
      {
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: input.conversationId,
      },
      turn.now(),
    );
  } catch (error) {
    console.error("[device] closing unfinished steps failed", error);
  }
}
