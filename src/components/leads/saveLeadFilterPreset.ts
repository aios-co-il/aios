import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { leadStagePresetFields } from "@/lib/leadStageFilter";
import type { FilterState } from "./LeadFiltersDialog";

export interface NewLeadFilterPreset {
  tenantId: string;
  userId: string;
  name: string;
  filters: FilterState;
}

export interface SavePresetCallbacks {
  onSaved: () => void;
  onError: (message: string) => void;
  onApply: (filters: FilterState) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * Saves the dialog's filters as a new preset, then applies them and closes the dialog, so
 * saving never leaves the list showing the previous filters. On an insert error the dialog
 * stays open with the error, and the user can retry without re-entering the filters.
 */
export async function saveLeadFilterPreset(
  db: Pick<SupabaseClient<Database>, "from">,
  preset: NewLeadFilterPreset,
  callbacks: SavePresetCallbacks,
): Promise<void> {
  const { error } = await db.from("lead_filter_presets").insert({
    tenant_id: preset.tenantId,
    user_id: preset.userId,
    name: preset.name,
    filters: toPresetFilters(preset.filters),
  });
  if (error) {
    callbacks.onError(error.message);
    return;
  }
  callbacks.onSaved();
  callbacks.onApply(preset.filters);
  callbacks.onOpenChange(false);
}

/** Serialises the dialog's filters into the JSON shape stored in `lead_filter_presets.filters`. */
export function toPresetFilters(filters: FilterState): Json {
  return {
    searchQuery: filters.searchQuery || null,
    salesPersonIds: filters.salesPersonIds,
    ...leadStagePresetFields(filters.stageIds),
    stageFilterMode: filters.stageFilterMode,
    responseStatus: filters.responseStatus,
    responseStatusFilterMode: filters.responseStatusFilterMode,
    tagIds: filters.tagIds,
    startDate: filters.startDate?.toISOString() || null,
    endDate: filters.endDate?.toISOString() || null,
    followUpToday: filters.followUpToday,
  };
}
