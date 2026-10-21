import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import {
  useBroadcastLists,
  type BroadcastList,
} from "@/hooks/useBroadcastLists";
import { materializeList } from "@/hooks/useMaterializeList";
import { insertSyncAutomation } from "@/hooks/useListSyncAutomation";
import { requireTenantId } from "@/lib/requireTenantId";
import type { CrmListFilter } from "@/components/broadcast/CrmListFilterBuilder";
import { errorMessage } from "@/components/broadcast/templateUtils";
import type {
  NewListKind,
  NewListType,
} from "@/components/broadcast/lists/NewListOptions";

export interface NewListInput {
  name: string;
  type: NewListType;
  kind: NewListKind;
  filter: CrmListFilter;
}

/** CRM lists: fill the new list from its filter (and add a lead sync automation). */
async function fillCrmList(
  tenantId: string,
  list: BroadcastList,
  { kind, filter }: NewListInput,
): Promise<string> {
  const res = await materializeList(tenantId, {
    mode: kind === "dynamic" ? "preview" : "freeze",
    listId: list.id,
  });
  // Lead lists also get an editable automation (on/off switch and a
  // place for extra steps on status changes).
  if (kind === "synced" && filter.source === "leads") {
    const automationId = await insertSyncAutomation(tenantId, list);
    list.source_config = {
      ...(list.source_config || {}),
      sync_automation_id: automationId,
    };
  }
  return kind === "dynamic"
    ? `רשימה דינמית · ${res.total} תואמים כרגע`
    : kind === "synced"
      ? `נוצרה רשימה מסונכרנת עם ${res.added ?? 0} אנשי קשר`
      : `נוצרה רשימה עם ${res.added ?? 0} אנשי קשר`;
}

/** Create a mailing list (manual/file or CRM filter); calls onCreated on success. */
export function useCreateMailingList(onCreated: (l: BroadcastList) => void) {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();
  const { createList } = useBroadcastLists();
  const onError = (e: unknown) =>
    toast.error("יצירת הרשימה נכשלה: " + errorMessage(e));

  const fill = useMutation({
    mutationFn: ({
      list,
      input,
    }: {
      list: BroadcastList;
      input: NewListInput;
    }) => fillCrmList(requireTenantId(tenantId), list, input),
    onSuccess: (message, { list }) => {
      toast.success(message);
      onCreated(list);
    },
    onError,
    onSettled: (_m, _e, { list }) => {
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] });
      qc.invalidateQueries({
        queryKey: ["broadcast-list-members", tenantId, list.id],
      });
      qc.invalidateQueries({ queryKey: ["automations", tenantId] });
    },
  });

  const create = (input: NewListInput) => {
    const crm = input.type === "crm";
    createList.mutate(
      {
        name: input.name.trim() || "רשימה חדשה",
        kind: crm && input.kind === "dynamic" ? "dynamic" : "static",
        source: crm ? "crm_filter" : "manual",
        // auto_sync: the database adds / removes members on every change.
        source_config: crm
          ? { ...input.filter, auto_sync: input.kind === "synced" }
          : {},
      },
      {
        onSuccess: (list) =>
          crm ? fill.mutate({ list, input }) : onCreated(list),
        onError,
      },
    );
  };

  return { create, isPending: createList.isPending || fill.isPending };
}
