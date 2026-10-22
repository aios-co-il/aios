/**
 * What an external brain (Cursor, Claude, Codex, Grok, parliament) reads
 * above the user's message: its own profile from AI Agents, then the session
 * skin. Carmen's internal brain gets both through run-ai-agent instead.
 */
import { agentProfileBlock, readAgentProfile } from "./agent-profile.ts";

export function withTaskPreface(
  route: { route_type: string; config?: unknown },
  skinBlock: string,
  content: string,
): string {
  if (route.route_type === "internal") return content;
  const parts = [
    route.route_type === "direct_channel"
      ? agentProfileBlock(readAgentProfile(route.config))
      : "",
    skinBlock.trim(),
  ].filter(Boolean);
  return parts.length ? `${parts.join("\n\n")}\n\n---\n\n${content}` : content;
}
