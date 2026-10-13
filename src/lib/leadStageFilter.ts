/** Empty selection means every pipeline stage. "all" is the legacy single-select value. */
export function normalizeLeadStageIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || id === "all" || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function leadMatchesStageFilter(
  status: string | null | undefined,
  stageIds: readonly string[],
): boolean {
  if (stageIds.length === 0) return true;
  return typeof status === "string" && stageIds.includes(status);
}

/** Prefer `stageIds`. Fall back to a legacy single `stageId`. */
export function leadStageIdsFromPreset(
  filters: { stageIds?: unknown; stageId?: unknown } | null | undefined,
): string[] {
  if (!filters) return [];
  if (Array.isArray(filters.stageIds))
    return normalizeLeadStageIds(filters.stageIds);
  return normalizeLeadStageIds(filters.stageId);
}

/**
 * Persist the array, and a single `stageId` when exactly one stage is chosen
 * so an older client still opens that preset on the right stage.
 */
export function leadStagePresetFields(stageIds: readonly string[]): {
  stageIds: string[];
  stageId: string;
} {
  const ids = normalizeLeadStageIds(stageIds);
  return {
    stageIds: ids,
    stageId: ids.length === 1 ? ids[0] : "all",
  };
}
