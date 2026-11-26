/**
 * Whose character a run-ai-agent turn speaks as. The fields it reads on the
 * whatsapp surface are service-only (bindRunAgentCaller in caller-trust.ts),
 * so only a WhatsApp webhook turn (runCarmenAI) can name a line owner or the
 * organization.
 */
import {
  ORG_PERSONA_FIELD,
  type PersonaSource,
} from "../_shared/carmen/persona-runtime.ts";
import { personalLineOwner } from "./line-owner-pick.ts";
import type { Surface } from "./surface.ts";

/**
 * The signed-in user in the app; on WhatsApp a personal line's owner, else the
 * organization when the turn arrived on its main line (AIO-654); and nobody in
 * tasks.
 */
export function turnPersonaSource(
  surface: Surface,
  body: Record<string, unknown>,
  callerUserId: string | null,
): PersonaSource | null {
  if (surface === "whatsapp") {
    const owner = personalLineOwner(body);
    if (owner) {
      return { kind: "user", userId: owner };
    }
    return body[ORG_PERSONA_FIELD] === true ? { kind: "organization" } : null;
  }
  const inApp = surface === "internal_chat" || surface === "aios";
  return inApp && callerUserId ? { kind: "user", userId: callerUserId } : null;
}
