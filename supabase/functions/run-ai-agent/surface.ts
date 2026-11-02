// Surface for which the agent is currently invoked.
// 'internal_chat' = the in-app chat / dialog / AI Support page (same brain as AIOS,
// but no dialog progress UI). Default for unspecified callers.
export type Surface =
  "whatsapp" | "aios" | "task" | "internal_chat" | "grok_bot";
