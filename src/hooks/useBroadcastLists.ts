import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { normalizePhone } from "../../supabase/functions/_shared/broadcast/template/template-vars.ts";

export interface BroadcastList {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  kind: "static" | "dynamic";
  source: "manual" | "csv" | "google_sheet" | "crm_filter";
  /** crm_filter lists: the AudienceFilter (source leads | clients). */
  source_config: any;
  auto_sync_enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  member_count: number;
  created_at: string;
}

export interface ListMember {
  id: string;
  list_id: string;
  entity_type: string;
  entity_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  added_via: string;
  custom_fields?: Record<string, string> | null;
}

export interface NewMemberRow {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  custom_fields?: Record<string, string>;
}

export interface ListPreview {
  success: boolean;
  total: number;
  withPhone: number;
  withEmail: number;
  added?: number;
  sample: { name: string | null; phone: string | null; email: string | null }[];
}

export interface ListRule {
  id: string;
  list_id: string;
  trigger: string;
  filter: { statusKeys?: string[]; sources?: string[] };
  enabled: boolean;
}

export function useBroadcastLists() {
  const { tenantId } = useCurrentTenant();
  const { userId } = useCurrentUser();
  const qc = useQueryClient();

  const lists = useQuery({
    queryKey: ["broadcast-lists", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<BroadcastList[]> => {
      const { data, error } = await supabase
        .from("broadcast_lists")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as BroadcastList[];
    },
  });

  const createList = useMutation({
    mutationFn: async (payload: Partial<BroadcastList>) => {
      const { data, error } = await supabase
        .from("broadcast_lists")
        .insert({
          tenant_id: tenantId,
          created_by: userId,
          name: payload.name ?? "רשימה חדשה",
          description: payload.description ?? null,
          kind: payload.kind ?? "static",
          source: payload.source ?? "manual",
          source_config: payload.source_config ?? {},
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as BroadcastList;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] }),
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("broadcast_lists")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] }),
  });

  const updateList = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<BroadcastList> & { id: string }) => {
      const { error } = await supabase
        .from("broadcast_lists")
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] }),
  });

  const useMembers = (listId: string | undefined) =>
    useQuery({
      queryKey: ["broadcast-list-members", tenantId, listId],
      enabled: !!listId,
      queryFn: async (): Promise<ListMember[]> => {
        const { data, error } = await supabase
          .from("broadcast_list_members")
          .select("*")
          .eq("list_id", listId)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return (data || []) as unknown as ListMember[];
      },
    });

  /** Upsert rows (manual, pasted CSV or uploaded file). member_count is kept by a DB trigger. */
  const addMembers = useMutation({
    mutationFn: async ({
      listId,
      rows,
      via,
    }: {
      listId: string;
      rows: NewMemberRow[];
      via: string;
    }) => {
      const payload = rows
        .map((r) => ({
          entity_type: "manual",
          name: r.name?.trim() || null,
          phone: normalizePhone(r.phone),
          email: r.email?.trim()?.toLowerCase() || null,
          custom_fields: r.custom_fields || {},
        }))
        .filter((r) => r.phone || r.email);
      let added = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const { data, error } = await supabase.rpc(
          "broadcast_list_add_members",
          {
            p_list_id: listId,
            p_rows: payload.slice(i, i + 500),
            p_added_via: via,
          },
        );
        if (error) throw error;
        added += Number(data || 0);
      }
      return added;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({
        queryKey: ["broadcast-list-members", tenantId, v.listId],
      });
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] });
    },
  });

  const removeMember = useMutation({
    mutationFn: async ({ id, listId }: { id: string; listId: string }) => {
      const { error } = await supabase
        .from("broadcast_list_members")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({
        queryKey: ["broadcast-list-members", tenantId, v.listId],
      });
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] });
    },
  });

  // ── Google Sheets ──
  const sheetHeaders = async (sheetId: string) => {
    const { data, error } = await supabase.functions.invoke(
      "import-broadcast-list-sheet",
      {
        body: { sheetId, fetchHeadersOnly: true, tenantId },
      },
    );
    if (error) throw error;
    return data as {
      headers: string[];
      previewRows: string[][];
      suggestedMap: Record<string, string>;
    };
  };

  const sheetImport = useMutation({
    mutationFn: async ({
      listId,
      sheetId,
      range,
      fieldMap,
      autoSync,
    }: {
      listId: string;
      sheetId: string;
      range?: string;
      fieldMap: Record<string, string>;
      autoSync: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "import-broadcast-list-sheet",
        {
          body: { listId, sheetId, range, fieldMap, tenantId },
        },
      );
      if (error) throw error;
      await supabase
        .from("broadcast_lists")
        .update({
          kind: autoSync ? "dynamic" : "static",
          auto_sync_enabled: autoSync,
        })
        .eq("id", listId);
      return data as { success: boolean; total: number };
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({
        queryKey: ["broadcast-list-members", tenantId, v.listId],
      });
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] });
    },
  });

  // ── Auto-add rules ──
  const useRules = (listId: string | undefined) =>
    useQuery({
      queryKey: ["broadcast-list-rules", tenantId, listId],
      enabled: !!listId,
      queryFn: async (): Promise<ListRule[]> => {
        const { data, error } = await supabase
          .from("broadcast_list_rules")
          .select("*")
          .eq("list_id", listId);
        if (error) throw error;
        return (data || []) as unknown as ListRule[];
      },
    });

  const addRule = useMutation({
    mutationFn: async ({ listId, filter }: { listId: string; filter: any }) => {
      const { error } = await supabase.from("broadcast_list_rules").insert({
        list_id: listId,
        tenant_id: tenantId,
        trigger: "lead_created",
        filter,
        enabled: true,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({
        queryKey: ["broadcast-list-rules", tenantId, v.listId],
      }),
  });

  const deleteRule = useMutation({
    mutationFn: async ({ id }: { id: string; listId: string }) => {
      const { error } = await supabase
        .from("broadcast_list_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({
        queryKey: ["broadcast-list-rules", tenantId, v.listId],
      }),
  });

  return {
    lists,
    createList,
    deleteList,
    updateList,
    useMembers,
    addMembers,
    removeMember,
    sheetHeaders,
    sheetImport,
    useRules,
    addRule,
    deleteRule,
  };
}
