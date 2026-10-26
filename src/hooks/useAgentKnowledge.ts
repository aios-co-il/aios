import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { toast } from "sonner";

export interface KnowledgeFolder {
  id: string;
  agent_id: string;
  tenant_id: string;
  parent_folder_id: string | null;
  name: string;
  icon: string | null;
  position: number;
}

export interface KnowledgeItem {
  id: string;
  agent_id: string;
  tenant_id: string;
  folder_id: string | null;
  title: string;
  content: string | null;
  kind: string;
  url: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export function useAgentKnowledge(agentId: string | null) {
  const folders = useQuery({
    queryKey: ["agent-knowledge-folders", agentId],
    enabled: !!agentId,
    queryFn: async (): Promise<KnowledgeFolder[]> => {
      const { data, error } = await supabase
        .from("agent_knowledge_folders")
        .select("*")
        .eq("agent_id", agentId!)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["agent-knowledge-items", agentId],
    enabled: !!agentId,
    queryFn: async (): Promise<KnowledgeItem[]> => {
      const { data, error } = await supabase
        .from("agent_knowledge_items")
        .select(
          "id, agent_id, tenant_id, folder_id, title, content, kind, url, tags, created_at, updated_at",
        )
        .eq("agent_id", agentId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return { folders, items };
}

export function useAgentKnowledgeMutations(agentId: string | null) {
  const qc = useQueryClient();
  const { tenantId } = useCurrentTenant();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ["agent-knowledge-folders", agentId] });
    qc.invalidateQueries({ queryKey: ["agent-knowledge-items", agentId] });
  };

  const createFolder = useMutation({
    mutationFn: async (input: {
      name: string;
      parent_folder_id?: string | null;
      icon?: string;
    }) => {
      if (!agentId || !tenantId) throw new Error("missing agent/tenant");
      const { error } = await supabase
        .from("agent_knowledge_folders")
        .insert({
          agent_id: agentId,
          tenant_id: tenantId,
          name: input.name,
          parent_folder_id: input.parent_folder_id ?? null,
          icon: input.icon ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      inv();
      toast.success("תיקייה נוצרה");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agent_knowledge_folders")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      inv();
      toast.success("נמחק");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createItem = useMutation({
    mutationFn: async (input: Partial<KnowledgeItem>) => {
      if (!agentId || !tenantId) throw new Error("missing agent/tenant");
      const { error } = await supabase
        .from("agent_knowledge_items")
        .insert({
          agent_id: agentId,
          tenant_id: tenantId,
          folder_id: input.folder_id ?? null,
          title: input.title ?? "ללא כותרת",
          content: input.content ?? null,
          kind: input.kind ?? "note",
          url: input.url ?? null,
          tags: input.tags ?? [],
        });
      if (error) throw error;
    },
    onSuccess: () => {
      inv();
      toast.success("נוסף");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<KnowledgeItem> & { id: string }) => {
      const { error } = await supabase
        .from("agent_knowledge_items")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => inv(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agent_knowledge_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      inv();
      toast.success("נמחק");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { createFolder, deleteFolder, createItem, updateItem, deleteItem };
}
