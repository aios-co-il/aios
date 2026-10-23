import type { BrainProfile } from "./types.ts";

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

/** Clamps a number-like value; undefined when it is not a number. */
function clampNumber(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}
