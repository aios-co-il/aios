/**
 * The assistant's display name, from one source (AIO-592).
 *
 * Org surfaces (the main WhatsApp line, the phone line, the AI's self-introduction) use the org's
 * name: the display name the owner sets on the Carmen agent, else the agent's own name, else
 * "כרמן". A Carmen variant in either field counts as unset, because the profile saves the agent's
 * name as its display name by default. Personal surfaces (a user's own line, a meeting a user
 * sends the bot to) use the user's picked character, falling back to the org's name.
 *
 * Pure (it imports only pure sibling modules), so the frontend imports it too.
 */

import { readAgentIdentity } from "./agent-identity.ts";
import { isCarmenName } from "./brain-access.ts";
import type { CarmenAgentRef } from "./carmen-agent.ts";

/** The product default, used only when the org set no name. */
export const DEFAULT_ASSISTANT_NAME = "כרמן";

/** The org's name for its assistant, from its Carmen agent row. */
export function orgAssistantName(agent: CarmenAgentRef | null): string {
  const displayName = readAgentIdentity(agent?.metadata).displayName?.trim();
  if (displayName && !isCarmenName(displayName)) {
    return displayName;
  }
  const name = agent?.name?.trim();
  return name && !isCarmenName(name) ? name : DEFAULT_ASSISTANT_NAME;
}

/** The name a personal surface shows: the user's character, else the org's name. */
export function personalAssistantName(
  personaName: string | null | undefined,
  orgName: string,
): string {
  return personaName?.trim() || orgName;
}
