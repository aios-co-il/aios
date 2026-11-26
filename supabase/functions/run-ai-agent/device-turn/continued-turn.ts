/**
 * A continuation request (AIO-686): resumed from its step, or answered without the model
 * with the stop line or one generic refusal.
 */
import { corsHeaders } from "../../_shared/cors.ts";
import { stoppedReply } from "../run-cancel.ts";
import { resumeFromStep } from "./continuation.ts";
import { offeredDeviceTools } from "./eligibility.ts";
import {
  answered,
  type DeviceTurn,
  deviceTurn,
  type Emit,
  type OpenTurn,
} from "./model-turn.ts";
import type { DeviceRequest } from "./request.ts";

/** A continuation: resumed from the step, or answered without the model. */
export async function continuedTurn(
  turn: OpenTurn,
  emit: Emit,
  actionId: string | null,
  announced: DeviceRequest["announced"],
): Promise<DeviceTurn> {
  const { verdict, input } = turn;
  // A continuation must come from a turn that could have held the step, in the step's own run.
  if (verdict.refusal !== null || !actionId || !input.userId) {
    console.warn(
      `[device] continuation refused: ${verdict.refusal ?? "no action or user"}`,
    );
    return answered(refusedReply());
  }
  try {
    const continuation = await resumeFromStep(
      turn.db,
      {
        tenantId: input.tenantId,
        userId: input.userId,
        runId: verdict.runId,
        conversationId: verdict.conversationId,
        actionId,
      },
      turn.origins,
      turn.now(),
    );
    if (continuation.kind === "refused") {
      console.warn(
        `[device] continuation of action=${actionId} refused: ${continuation.reason}`,
      );
      return answered(refusedReply());
    }
    if (continuation.kind === "stopped") {
      return answered(stoppedResponse(emit, verdict.conversationId));
    }
    return deviceTurn(
      turn,
      offeredDeviceTools(verdict, announced, continuation.stepsUsed),
      continuation.outcome,
    );
  } catch (error) {
    console.error(`[device] continuation of action=${actionId} failed`, error);
    return answered(refusedReply());
  }
}

/** One answer to every refused continuation, so a caller learns nothing about a step not theirs. */
function refusedReply(): Response {
  return json({ success: false, error: "device_step_unavailable" }, 409);
}

/** The run was stopped: the stop line, as a stopped turn says it, and no model call. */
function stoppedResponse(emit: Emit, conversationId: string): Response {
  const output = stoppedReply([]);
  emit?.({ type: "token", content: output });
  return json({ success: true, output, conversation_id: conversationId });
}

/** A JSON response with CORS headers. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
