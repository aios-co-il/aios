/**
 * A connected agent's profile (Cursor, Claude, Codex, Grok), stored on its
 * brain route as config.profile. Pure helpers shared by the AI Agents screen
 * and agent-channel-send, which puts the profile at the top of each task.
 */

export type AgentProfile = {
  displayName?: string;
  persona?: string;
  instructions?: string;
  avatarPath?: string;
};

/** Reads config.profile from a brain route's config, ignoring bad fields. */
export function readAgentProfile(config: unknown): AgentProfile {
  const raw =
    config && typeof config === "object"
      ? (config as Record<string, unknown>).profile
      : null;
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  const text = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  return {
    displayName: text(p.displayName),
    persona: text(p.persona),
    instructions: text(p.instructions),
    avatarPath: text(p.avatarPath),
  };
}

/**
 * The profile as task instructions for the agent, or "" when the profile has
 * nothing to say. The avatar is display-only and never sent.
 */
export function agentProfileBlock(profile: AgentProfile): string {
  const lines = [
    profile.displayName && `You are "${profile.displayName}".`,
    profile.persona && `Persona: ${profile.persona}`,
    profile.instructions && `Standing instructions:\n${profile.instructions}`,
  ].filter(Boolean);
  if (!lines.length) return "";
  return `[Agent profile set in AIOS]\n${lines.join("\n")}`.slice(0, 4000);
}
