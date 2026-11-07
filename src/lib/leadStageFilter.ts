export type LeadValueFilterMode = "show" | "hide";

/** Sentinel stage id used when a hide filter excludes every known stage. */
export const NO_MATCHING_STAGE_ID = "__no_matching_stage__";

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

/** Unknown values stay on "show" so older presets keep include-only behavior. */
export function normalizeLeadValueFilterMode(
  value: unknown,
): LeadValueFilterMode {
  return value === "hide" ? "hide" : "show";
}

export function leadMatchesStageFilter(
  status: string | null | undefined,
  stageIds: readonly string[],
  mode: LeadValueFilterMode = "show",
): boolean {
  if (stageIds.length === 0) return true;
  const listed = typeof status === "string" && stageIds.includes(status);
  return normalizeLeadValueFilterMode(mode) === "hide" ? !listed : listed;
}

/** Null and empty response status count as the "none" choice. */
export function leadMatchesResponseStatusFilter(
  status: string | null | undefined,
  selected: readonly string[],
  mode: LeadValueFilterMode = "show",
): boolean {
  if (selected.length === 0) return true;
  const key = status == null || status === "" ? "none" : status;
  const listed = selected.includes(key);
  return normalizeLeadValueFilterMode(mode) === "hide" ? !listed : listed;
}

/**
 * Stages to keep. `null` means no stage filter.
 * Hide returns the complement; an empty complement matches nothing.
 */
export function includedStageIds(
  selected: readonly string[],
  allStageIds: readonly string[],
  mode: LeadValueFilterMode = "show",
): string[] | null {
  const ids = normalizeLeadStageIds(selected);
  if (ids.length === 0) return null;
  if (normalizeLeadValueFilterMode(mode) === "show") return ids;
  const hidden = new Set(ids);
  return allStageIds.filter((id) => !hidden.has(id));
}

/** Kanban RPC is include-only. An empty complement must not be sent as "all stages". */
export function stagesForKanbanQuery(
  selected: readonly string[],
  allStageIds: readonly string[],
  mode: LeadValueFilterMode = "show",
): string[] {
  const included = includedStageIds(selected, allStageIds, mode);
  if (included == null) return [...allStageIds];
  if (included.length === 0) return [NO_MATCHING_STAGE_ID];
  return included;
}

/**
 * Kanban `p_response_statuses` cannot exclude values or keep SQL nulls.
 * Those cases return null and are filtered on the client.
 */
export function kanbanResponseStatuses(
  selected: readonly string[],
  mode: LeadValueFilterMode = "show",
): string[] | null {
  if (selected.length === 0) return null;
  if (normalizeLeadValueFilterMode(mode) === "hide") return null;
  if (selected.includes("none")) return null;
  return [...selected];
}

export function responseFilterNeedsClient(
  selected: readonly string[],
  mode: LeadValueFilterMode = "show",
): boolean {
  if (selected.length === 0) return false;
  if (normalizeLeadValueFilterMode(mode) === "hide") return true;
  return selected.includes("none");
}

/** The PostgREST filter calls the stage and response filters need. */
export interface LeadValueFilterQuery<Q> {
  in(column: string, values: readonly string[]): Q;
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: string | null): Q;
  or(filters: string): Q;
}

export function applyLeadStageQuery<Q extends LeadValueFilterQuery<Q>>(
  query: Q,
  selected: readonly string[],
  mode: LeadValueFilterMode = "show",
  allStageIds?: readonly string[],
): Q {
  const ids = normalizeLeadStageIds(selected);
  if (ids.length === 0) return query;
  if (normalizeLeadValueFilterMode(mode) === "show") {
    return query.in("status", ids);
  }
  if (allStageIds && allStageIds.length > 0) {
    const visible = allStageIds.filter((id) => !ids.includes(id));
    return query.in(
      "status",
      visible.length > 0 ? visible : [NO_MATCHING_STAGE_ID],
    );
  }
  return query.not("status", "in", `(${ids.join(",")})`);
}

/**
 * Show keeps the existing include rules, including the none+others case that
 * stays unfiltered here and is applied on the client.
 * Hide drops the chosen values and, unless "none" is chosen, keeps nulls.
 */
export function applyResponseStatusFilter<Q extends LeadValueFilterQuery<Q>>(
  query: Q,
  selected: readonly string[],
  mode: LeadValueFilterMode = "show",
): Q {
  if (selected.length === 0) return query;
  const keys = selected.filter((status) => status && status !== "none");
  const hasNone = selected.includes("none");
  if (!hasNone && keys.length === 0) return query;
  const hide = normalizeLeadValueFilterMode(mode) === "hide";

  if (!hide) {
    if (hasNone && keys.length === 0) return query.is("response_status", null);
    if (!hasNone) return query.in("response_status", keys);
    return query;
  }

  if (hasNone && keys.length === 0) {
    return query.not("response_status", "is", null);
  }
  if (hasNone) {
    return query
      .not("response_status", "is", null)
      .not("response_status", "in", `(${keys.join(",")})`);
  }
  return query.or(
    `response_status.is.null,response_status.not.in.(${keys.join(",")})`,
  );
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
