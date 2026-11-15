/**
 * An agent's visual identity (`ai_agents.metadata.visual_identity`), as the owner sets it in the
 * agent's profile. Pure, so the frontend and edge functions read it the same way.
 */

/** The visual identity fields of an agent. */
export type AgentIdentity = {
  displayName?: string;
  avatarUrl?: string;
  avatarPath?: string;
  prompt?: string;
};

/** Reads `metadata.visual_identity`; fields with the wrong type are left out. */
export function readAgentIdentity(metadata: unknown): AgentIdentity {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  const value = (metadata as Record<string, unknown>).visual_identity;
  if (!value || typeof value !== "object") {
    return {};
  }
  const row = value as Record<string, unknown>;
  return {
    displayName:
      typeof row.displayName === "string" ? row.displayName : undefined,
    avatarUrl:
      typeof row.avatarUrl === "string" && /^https:\/\//.test(row.avatarUrl)
        ? row.avatarUrl
        : undefined,
    avatarPath: typeof row.avatarPath === "string" ? row.avatarPath : undefined,
    prompt: typeof row.prompt === "string" ? row.prompt : undefined,
  };
}
