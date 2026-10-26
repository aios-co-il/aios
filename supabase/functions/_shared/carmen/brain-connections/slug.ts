/** Route slugs for brains connected from Carmen settings. */

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
  "smart",
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
