/**
 * The assistant's display name, from one source (AIO-592).
 *
 * Org surfaces (the main WhatsApp line, notifications, alerts) use the org's name: the display
 * name the owner sets on the Carmen agent (`metadata.visual_identity.displayName`), else the
 * agent's own name when it is not just a Carmen variant, else "כרמן". Personal surfaces (in-app
 * chat, a user's own line, a meeting a user sends the bot to) use the user's picked character,
 * falling back to the org's name.
 *
 * Dependency-free so the frontend imports it too.
 */

import { isCarmenName } from "./brain-access.ts";

/** The product default, used only when nothing is set. */
export const DEFAULT_ASSISTANT_NAME = "כרמן";

/** The fields of an `ai_agents` row the name is read from. */
export type AssistantNameSource = {
  name?: string | null;
  metadata?: unknown;
} | null;

/** The org's name for its assistant, from its Carmen agent row. */
export function orgAssistantName(agent: AssistantNameSource): string {
  const displayName = visualDisplayName(agent?.metadata);
  if (displayName) {
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

/** `metadata.visual_identity.displayName`, trimmed, or null. */
function visualDisplayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const identity = (metadata as { visual_identity?: unknown }).visual_identity;
  if (!identity || typeof identity !== "object") {
    return null;
  }
  const displayName = (identity as { displayName?: unknown }).displayName;
  return typeof displayName === "string" && displayName.trim()
    ? displayName.trim()
    : null;
}
