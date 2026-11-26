import {
  elevenLabsConfig,
  mintElevenLabsSession,
} from "./elevenlabs-session.ts";
import { chooseElevenLabsVoice } from "./elevenlabs-voices.ts";
import {
  loadCallerAddress,
  loadSessionContext,
  sessionInstructions,
} from "./session-context.ts";

/** The request fields an ElevenLabs call reads. */
export type ElevenLabsRequest = {
  voice?: unknown;
  tenant_id?: unknown;
};

/** The HTTP status and JSON body for the app. */
export type ElevenLabsReply = { status: number; body: unknown };

/**
 * An ElevenLabs conversation (AIO-505). ElevenLabs has no personal keys, so it runs on the
 * org key and only for callers who may use it (`orgVoiceKeyAllowed`).
 */
export async function elevenLabsReply(
  callerId: string,
  mayUseOrgKey: boolean,
  request: ElevenLabsRequest,
): Promise<ElevenLabsReply> {
  if (!mayUseOrgKey) {
    return { status: 403, body: { error: "elevenlabs_not_allowed" } };
  }
  const context = await loadSessionContext(callerId, request.tenant_id);
  const result = await mintElevenLabsSession(
    elevenLabsConfig((name) => Deno.env.get(name)),
    sessionInstructions(context, await loadCallerAddress(callerId)),
    chooseElevenLabsVoice(request.voice, context.agent?.voice ?? null),
  );
  return result.ok
    ? { status: 200, body: result.session }
    : { status: result.status, body: { error: result.error } };
}
