import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { BroadcastList } from "@/hooks/useBroadcastLists";
import { requireTenantId } from "@/lib/requireTenantId";

/**
 * Editable flow automation that keeps a CRM-filter list in sync:
 * on every lead status / stage change it runs sync_mailing_list, which adds
 * the lead when it matches the list's filter and removes it when it no longer
 * does. The automation id is kept in source_config.sync_automation_id.
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
  const triggerId = crypto.randomUUID();
  const steps: TablesInsert<"automation_flow_steps">[] = [
    {
      id: triggerId,
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
    },
    {
      id: crypto.randomUUID(),
      automation_id: automation.id,
      tenant_id: tenantId,
      step_type: "action",
      action_type: "sync_mailing_list",
      label: `סנכרון לרשימה: ${list.name}`,
      configuration: { list_id: list.id },
      position_x: 400,
      position_y: 230,
      sort_order: 1,
      parent_step_id: triggerId,
      condition_branch: null,
    },
  ];
  const { error: stepsErr } = await supabase
    .from("automation_flow_steps")
    .insert(steps);
  if (stepsErr) {
    await supabase.from("automations").delete().eq("id", automation.id);
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
  if (linkErr) throw linkErr;
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
