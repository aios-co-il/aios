/** Built-in brains and the env names their launchers read (AIO-303). */

/**
 * Built-in brains whose key can be set from the UI. `secretEnv` is the env
 * secret the UI key replaces; `idEnv` is an optional non-secret id the brain
 * also needs (kept in `settings.external_id`). `envNames` is every env name
 * the brain's launchers read, aliases included: a send takes all of them from
 * one source, so a tenant id never travels with a project key (AIO-303).
 */
export type BuiltinBrainKey = {
  slug: string;
  label: string;
  secretEnv: string;
  idEnv?: string;
  idLabel?: string;
  envNames: string[];
};

export const BUILTIN_BRAIN_KEYS: BuiltinBrainKey[] = [
  {
    slug: "cursor",
    label: "Cursor",
    secretEnv: "CURSOR_API_KEY",
    // GROK_BOT_API_KEY is a Cursor key too (cursorApiKey); the agent ids
    // name Cursor agents of the account that owns the project key.
    envNames: [
      "CURSOR_API_KEY",
      "GROK_BOT_API_KEY",
      "CURSOR_DIRECT_AGENT_ID",
      "CURSOR_STICKY_AGENT_ID",
    ],
  },
  {
    slug: "claude",
    label: "Claude Direct",
    secretEnv: "CLAUDE_ROUTINE_TOKEN",
    idEnv: "CLAUDE_ROUTINE_ID",
    idLabel: "Routine ID",
    envNames: ["CLAUDE_ROUTINE_TOKEN", "CLAUDE_ROUTINE_ID"],
  },
  {
    slug: "codex",
    label: "Codex",
    secretEnv: "CODEX_WORK_AGENT_TOKEN",
    idEnv: "CODEX_WORK_AGENT_TRIGGER_ID",
    idLabel: "Trigger ID",
    envNames: ["CODEX_WORK_AGENT_TOKEN", "CODEX_WORK_AGENT_TRIGGER_ID"],
  },
  {
    slug: "chatgpt",
    label: "ChatGPT Workspace",
    secretEnv: "CHATGPT_WORK_AGENT_TOKEN",
    idEnv: "CHATGPT_WORK_AGENT_TRIGGER_ID",
    idLabel: "Trigger ID",
    // Aliases read by workspaceAgentCreds.
    envNames: [
      "CHATGPT_WORK_AGENT_TOKEN",
      "CHATGPT_WORK_AGENT_ACCESS_TOKEN",
      "CHATGPT_WORK_AGENT_TRIGGER_ID",
      "CHATGPT_WORK_AGENT_API_TRIGGER_ID",
      "WORKSPACE_AGENT_TRIGGER_ID",
      "CHATGPT_WORK_AGENT_WORKFLOW_ID",
    ],
  },
  {
    slug: "grok",
    label: "Grok Bot",
    secretEnv: "GROK_BOT_WEBHOOK_KEY",
    idEnv: "GROK_BOT_WEBHOOK_URL",
    idLabel: "Webhook URL",
    envNames: ["GROK_BOT_WEBHOOK_KEY", "GROK_BOT_WEBHOOK_URL"],
  },
];

export function builtinKeyFor(slug: string): BuiltinBrainKey | null {
  return BUILTIN_BRAIN_KEYS.find((b) => b.slug === slug) ?? null;
}
