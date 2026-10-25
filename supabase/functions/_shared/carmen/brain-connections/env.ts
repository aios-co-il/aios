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
