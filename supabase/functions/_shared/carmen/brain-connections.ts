/**
 * Carmen brain connections: presets and pure helpers shared by the edge
 * functions and the UI (re-exported from src/lib/carmenBrainConnections.ts).
 * No Deno or browser APIs here.
 */

export type BrainConnectionKind = "chat_model" | "builtin";

export type BrainProfile = {
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  description?: string;
  color?: string;
};

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

/** Slugs a new connection may not take: built-in routes and reserved names. */
export const RESERVED_BRAIN_SLUGS = new Set([
  "cursor",
  "internal",
  "grok",
  "codex",
  "claude",
  "chatgpt",
  "parliament",
  "carmen",
  "model",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/;

export function isValidBrainSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_BRAIN_SLUGS.has(slug);
}

/** A slug from a display name; Hebrew-only names fall back to "brain-<n>". */
export function slugFromName(
  name: string,
  taken: Iterable<string> = [],
): string {
  const used = new Set(taken);
  let base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (base.length < 2) base = "brain";
  if (RESERVED_BRAIN_SLUGS.has(base)) base = `${base}-brain`;
  let slug = base;
  for (let n = 2; used.has(slug) || !isValidBrainSlug(slug); n++) {
    slug = `${base}-${n}`;
    if (n > 999) break;
  }
  return slug;
}

export function normalizeBaseUrl(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "");
}

/** Only public https endpoints. */
export function baseUrlProblem(raw: string): string | null {
  const url = normalizeBaseUrl(raw);
  if (!url) return "Base URL is required";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Base URL is not a valid URL";
  }
  if (parsed.protocol !== "https:") return "Base URL must use https";
  if (parsed.username || parsed.password)
    return "Base URL must not contain credentials";
  if (isPrivateHost(parsed.hostname)) return "Base URL must be a public host";
  return null;
}

/** Blocks obvious internal targets; the server fetches this URL. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  )
    return true;
  if (h.includes(":"))
    return (
      h === "::" ||
      h === "::1" ||
      /^f[cd][0-9a-f]{0,2}:/.test(h) ||
      h.startsWith("fe80:") ||
      h.startsWith("::ffff:")
    );
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/** Keeps only known profile fields, with sane limits. */
export function sanitizeProfile(raw: unknown): BrainProfile {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out: BrainProfile = {};
  if (typeof src.system_prompt === "string" && src.system_prompt.trim())
    out.system_prompt = src.system_prompt.trim().slice(0, 20_000);
  const temperature = clampNumber(src.temperature, 0, 2);
  if (temperature !== undefined) out.temperature = temperature;
  const maxTokens = clampNumber(src.max_tokens, 16, 32_000);
  if (maxTokens !== undefined) out.max_tokens = Math.round(maxTokens);
  if (typeof src.description === "string" && src.description.trim())
    out.description = src.description.trim().slice(0, 300);
  if (
    typeof src.color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(src.color.trim())
  )
    out.color = src.color.trim();
  return out;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

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

/** Env for a send: tenant UI keys win over project env secrets. */
export function overlayBrainEnv(
  base: Record<string, string | undefined>,
  overrides: Record<string, string>,
): Record<string, string | undefined> {
  const out = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function maskKey(last4: string | null | undefined): string {
  return last4 ? `••••${last4}` : "";
}
