/**
 * What an external brain (Cursor, Claude, Codex, Grok, parliament) reads
 * besides the user's message. The connected agent's profile goes in the
 * preface, which each adapter puts above its own wrapper and history; the
 * session skin goes above the message. Carmen's internal brain gets both
 * through run-ai-agent instead.
 */
import { agentProfileBlock, readAgentProfile } from "./agent-profile.ts";

export function taskParts(
  route: { route_type: string; config?: unknown },
  skinBlock: string,
  content: string,
): { preface: string; content: string } {
  if (route.route_type === "internal") return { preface: "", content };
  const preface =
    route.route_type === "direct_channel"
      ? agentProfileBlock(readAgentProfile(route.config))
      : "";
  const skin = skinBlock.trim();
  return {
    preface,
    content: skin ? `${skin}\n\n---\n\n${content}` : content,
  };
}
