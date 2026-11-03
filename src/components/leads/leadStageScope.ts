import type { LeadViewMode } from "@/lib/leadViewMode";

/** Which leads the Leads screen opens on: every stage, or the first ("new"). */
export type LeadStageScope = "all" | "new";

export const LEAD_STAGE_SCOPES: ReadonlyArray<LeadStageScope> = ["all", "new"];

export const LEAD_STAGE_SCOPE_LABELS: Record<LeadStageScope, string> = {
  all: "כל הלידים",
  new: "לידים חדשים",
};

/** The saved scope from `lead_list_defaults.stage_scope`, or null for none. */
export function parseLeadStageScope(
  value: string | null | undefined,
): LeadStageScope | null {
  return value === "all" || value === "new" ? value : null;
}

/**
 * Whether the screen should open filtered to the first pipeline stage. A saved
 * scope wins in every view; without one, only chat opens on new leads.
 */
export function opensOnNewLeads(
  savedScope: LeadStageScope | null,
  viewMode: LeadViewMode,
): boolean {
  if (savedScope) {
    return savedScope === "new";
  }
  return viewMode === "chat";
}

/** What the opening filter does for one tenant and view. */
export type OpeningStageDecision =
  { kind: "wait" } | { kind: "leave" } | { kind: "apply"; stageKey: string };

/**
 * The stage filter the screen opens on: leave a filter or preset the user
 * already chose, wait for the pipeline stages, otherwise filter to the first
 * stage when `opensOnNewLeads` says so.
 */
export function decideOpeningStage(input: {
  savedScope: LeadStageScope | null;
  viewMode: LeadViewMode;
  userChoseFilter: boolean;
  firstStageKey: string | undefined;
}): OpeningStageDecision {
  if (
    !opensOnNewLeads(input.savedScope, input.viewMode) ||
    input.userChoseFilter
  ) {
    return { kind: "leave" };
  }
  if (!input.firstStageKey) {
    return { kind: "wait" };
  }
  return { kind: "apply", stageKey: input.firstStageKey };
}
