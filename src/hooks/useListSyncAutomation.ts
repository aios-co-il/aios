import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { BroadcastList } from "@/hooks/useBroadcastLists";
import { requireTenantId } from "@/lib/requireTenantId";

/**
 * Trigger-only flow automation that acts as the on/off switch of a synced
 * lead list: the database triggers add / remove members while it is active,
 * and owners can hang extra steps on the same lead status / stage change.
 * Its id is kept in source_config.sync_automation_id; deleting the
 * automation turns the list static (database trigger).
 */
export async function insertSyncAutomation(
  tenantId: string,
  list: BroadcastList,
): Promise<string> {
  const automationRow: TablesInsert<"automations"> = {
    name: `רשימת דיוור: ${list.name} – סנכרון אוטומטי`,
    description:
      "נוצרה אוטומטית עם רשימת הדיוור: מי שעונה לסינון נכנס לרשימה, מי שיוצא ממנו יוצא.",
    tenant_id: tenantId,
    trigger_type: "lead_status_changed",
    action_type: "notification",
    configuration: {},
    is_flow: true,
    active: true,
  };
  const { data: automation, error } = await supabase
    .from("automations")
    .insert(automationRow)
    .select("id")
    .single();
  if (error) throw error;
  const discard = () =>
    supabase.from("automations").delete().eq("id", automation.id);
  const trigger: TablesInsert<"automation_flow_steps"> = {
    automation_id: automation.id,
    tenant_id: tenantId,
    step_type: "trigger",
    action_type: "lead_status_changed",
    label: "שינוי סטטוס / שלב במשפך",
    configuration: {
      filter_statuses: [],
      filter_status: "any",
      filter_status_kind: null,
    },
    position_x: 400,
    position_y: 80,
    sort_order: 0,
    parent_step_id: null,
    condition_branch: null,
  };
  const { error: stepsErr } = await supabase
    .from("automation_flow_steps")
    .insert(trigger);
  if (stepsErr) {
    await discard();
    throw stepsErr;
  }
  const { error: linkErr } = await supabase
    .from("broadcast_lists")
    .update({
      source_config: {
        ...(list.source_config || {}),
        sync_automation_id: automation.id,
      },
    })
    .eq("id", list.id);
  if (linkErr) {
    await discard();
    throw linkErr;
  }
  return automation.id;
}

/** Create / delete the sync automation that belongs to a CRM-filter list. */
export function useListSyncAutomation() {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] });
    qc.invalidateQueries({ queryKey: ["automations", tenantId] });
  };

  const createSyncAutomation = useMutation({
    mutationFn: (list: BroadcastList) =>
      insertSyncAutomation(requireTenantId(tenantId), list),
    onSuccess: invalidate,
  });

  /** Best effort: the list's sync automation would only fail once the list is gone. */
  const deleteSyncAutomation = useMutation({
    mutationFn: async (automationId: string) => {
      await supabase.from("automations").delete().eq("id", automationId);
    },
    onSettled: invalidate,
  });

  return { createSyncAutomation, deleteSyncAutomation };
}
