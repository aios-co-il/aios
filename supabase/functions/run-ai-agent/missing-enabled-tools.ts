/**
 * Tools from allTools that `names` asks for, that the pool lacks and that
 * disabled_tools does not turn off, in allTools order. Matched skins, pinned
 * skins and Carmen's pulse tools add these past a narrow allowed_tools; the
 * denylist always wins.
 */
export function missingEnabledTools<T extends { name: string }>(
  pool: readonly { name: string }[],
  allTools: readonly T[],
  names: Iterable<string>,
  disabledTools: readonly string[],
): T[] {
  const wanted = new Set(names);
  const present = new Set(pool.map((t) => t.name));
  return allTools.filter(
    (t) =>
      wanted.has(t.name) &&
      !present.has(t.name) &&
      !disabledTools.includes(t.name),
  );
}
