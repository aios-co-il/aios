import type { BrainProfile, ChatMessage } from "./types.ts";

const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 16_000;

/** Messages for one model-brain turn: profile prompt, recent history, new text. */
export function buildModelMessages(args: {
  profile: BrainProfile;
  history: Array<{ role: string; content: string }>;
  content: string;
}): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (args.profile.system_prompt)
    messages.push({ role: "system", content: args.profile.system_prompt });
  const recent = (args.history || [])
    .filter(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-MAX_HISTORY);
  for (const m of recent) {
    messages.push({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, MAX_MESSAGE_CHARS),
    });
  }
  // The chat bar's history may already end with this message; the server copy
  // can carry a skin or bug-fix prefix, so it replaces the history copy.
  const last = messages[messages.length - 1];
  if (
    last &&
    last.role === "user" &&
    last.content &&
    args.content.endsWith(last.content)
  )
    messages.pop();
  messages.push({ role: "user", content: args.content });
  return messages;
}
