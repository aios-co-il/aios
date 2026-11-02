import type { LeadViewMode } from "@/lib/leadViewMode";

/** Which leads the Leads screen opens on: every stage, or the first ("new"). */
export type LeadStageScope = "all" | "new";

export const LEAD_STAGE_SCOPES: readonly LeadStageScope[] = ["all", "new"];

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
