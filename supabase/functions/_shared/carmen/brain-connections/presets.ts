/** Model presets and the built-in brains whose key can be set from Carmen settings. */

export type ModelPreset = {
  id: string;
  label: string;
  base_url: string;
  models: string[];
  key_hint: string;
};

/** OpenAI-compatible chat endpoints. "custom" lets the user type a base URL. */
export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o4-mini"],
    key_hint: "sk-…",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    base_url: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    key_hint: "sk-ant-…",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    key_hint: "AIza…",
  },
  {
    id: "xai",
    label: "xAI (Grok API)",
    base_url: "https://api.x.ai/v1",
    models: ["grok-4", "grok-3-mini"],
    key_hint: "xai-…",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    models: ["openrouter/auto"],
    key_hint: "sk-or-…",
  },
  {
    id: "custom",
    label: "אחר (OpenAI-compatible)",
    base_url: "",
    models: [],
    key_hint: "",
  },
];

export function presetById(id: string | null | undefined): ModelPreset | null {
  return MODEL_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Built-in brains whose key can be set from the UI. `secretEnv` is the env
 * secret the UI key replaces; `idEnv` is an optional non-secret id the brain
 * also needs (kept in `settings.external_id`).
 */
export type BuiltinBrainKey = {
  slug: string;
  label: string;
  secretEnv: string;
  idEnv?: string;
  idLabel?: string;
};

export const BUILTIN_BRAIN_KEYS: BuiltinBrainKey[] = [
  { slug: "cursor", label: "Cursor", secretEnv: "CURSOR_API_KEY" },
  {
    slug: "claude",
    label: "Claude Direct",
    secretEnv: "CLAUDE_ROUTINE_TOKEN",
    idEnv: "CLAUDE_ROUTINE_ID",
    idLabel: "Routine ID",
  },
  {
    slug: "codex",
    label: "Codex",
    secretEnv: "CODEX_WORK_AGENT_TOKEN",
    idEnv: "CODEX_WORK_AGENT_TRIGGER_ID",
    idLabel: "Trigger ID",
  },
  {
    slug: "chatgpt",
    label: "ChatGPT Workspace",
    secretEnv: "CHATGPT_WORK_AGENT_TOKEN",
    idEnv: "CHATGPT_WORK_AGENT_TRIGGER_ID",
    idLabel: "Trigger ID",
  },
  {
    slug: "grok",
    label: "Grok Bot",
    secretEnv: "GROK_BOT_WEBHOOK_KEY",
    idEnv: "GROK_BOT_WEBHOOK_URL",
    idLabel: "Webhook URL",
  },
];

export function builtinKeyFor(slug: string): BuiltinBrainKey | null {
  return BUILTIN_BRAIN_KEYS.find((b) => b.slug === slug) ?? null;
}
