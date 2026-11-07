import {
  elevenLabsConfig,
  mintElevenLabsSession,
} from "./elevenlabs-session.ts";
import {
  chooseElevenLabsVoice,
  ELEVENLABS_VOICES,
} from "./elevenlabs-voices.ts";
import {
  loadCallerName,
  loadSessionContext,
  sessionInstructions,
} from "./session-context.ts";

/** The request fields an ElevenLabs call reads. */
export type ElevenLabsRequest = {
  voice?: unknown;
  tenant_id?: unknown;
  list_voices?: unknown;
};

/** The HTTP status and JSON body for the app. */
export type ElevenLabsReply = { status: number; body: unknown };

/**
 * The Android app's ElevenLabs request (AIO-505): the voice list for its picker, or a
 * conversation. ElevenLabs has no personal keys, so a conversation runs on the org key and
 * only for callers who may use it (`orgVoiceKeyAllowed`).
 */
export async function elevenLabsReply(
  callerId: string,
  mayUseOrgKey: boolean,
  request: ElevenLabsRequest,
): Promise<ElevenLabsReply> {
  if (request.list_voices === true) {
    const voices = ELEVENLABS_VOICES.map(({ id, label }) => ({ id, label }));
    return { status: 200, body: { voices } };
  }
  if (!mayUseOrgKey) {
    return { status: 403, body: { error: "elevenlabs_not_allowed" } };
  }
  const context = await loadSessionContext(callerId, request.tenant_id);
  const result = await mintElevenLabsSession(
    elevenLabsConfig((name) => Deno.env.get(name)),
    sessionInstructions(context, await loadCallerName(callerId)),
    chooseElevenLabsVoice(request.voice, context.agent?.voice ?? null),
  );
  return result.ok
    ? { status: 200, body: result.session }
    : { status: result.status, body: { error: result.error } };
}
