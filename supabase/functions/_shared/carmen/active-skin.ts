/**
 * The skin a user picked for this chat session. The client sends its slug
 * with each request; it is never stored on Carmen's shared agent row, so one
 * user's choice never changes Carmen for anyone else.
 */
import { buildSkillsBlockBySlug } from "../skills/registry.ts";

/** A safe skin slug from a request body, or null. */
export function parseActiveSkin(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_-]{1,64}$/i.test(value)
    ? value
    : null;
}

/**
 * The skin's instructions block, or "" when there is no skin, it is disabled
 * on the agent, it is already pinned, or it can't be resolved.
 */
export async function activeSkinBlock(args: {
  slug: string | null;
  tenantId: string | null;
  disabledSkins?: string[] | null;
  pinned?: unknown;
}): Promise<string> {
  const { slug } = args;
  if (!slug) return "";
  if ((args.disabledSkins ?? []).includes(slug)) return "";
  if (Array.isArray(args.pinned) && args.pinned.includes(slug)) return "";
  try {
    return await buildSkillsBlockBySlug([slug], args.tenantId);
  } catch (e) {
    console.error("[carmen] active-skin resolution failed (non-fatal):", e);
    return "";
  }
}
