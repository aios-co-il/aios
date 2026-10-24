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

/** Field limits, matching the profile form. */
export const PROFILE_LIMITS = {
  displayName: 80,
  persona: 500,
  instructions: 4000,
} as const;

/** Reads config.profile from a brain route's config, ignoring bad fields. */
export function readAgentProfile(config: unknown): AgentProfile {
  const raw =
    config && typeof config === "object"
      ? (config as Record<string, unknown>).profile
      : null;
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  const text = (v: unknown, max = 1000) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
  return {
    displayName: text(p.displayName, PROFILE_LIMITS.displayName),
    persona: text(p.persona, PROFILE_LIMITS.persona),
    instructions: text(p.instructions, PROFILE_LIMITS.instructions),
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
  return `[Agent profile set in AIOS]\n${lines.join("\n")}`;
}
