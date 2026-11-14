// Conservative name match: normalize (lowercase, strip punctuation/whitespace) and
// accept only a strong match — exact, or one side fully contains the other with a
// length ratio >= 0.6 (so "fly" won't grab "flyaway studio"). Returns best or null.
/** Retains the existing fbStrongMatchAccount behavior. */
export function fbStrongMatchAccount(
  accounts: Array<{ id: string; name: string; status: number | null }>,
  clientName: string,
): { id: string; name: string } | null {
  /** Normalizes names exactly as the original conservative account matcher. */
  function norm(s: string) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  const c = norm(clientName);
  if (c.length < 3) {
    return null;
  }
  let best: { id: string; name: string; score: number } | null = null;
  for (const a of accounts) {
    const n = norm(a.name);
    if (!n) {
      continue;
    }
    let score = 0;
    if (n === c) {
      score = 1;
    } else if (n.includes(c) || c.includes(n)) {
      const ratio = Math.min(n.length, c.length) / Math.max(n.length, c.length);
      if (ratio >= 0.6) {
        score = ratio;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: a.id, name: a.name, score };
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}
