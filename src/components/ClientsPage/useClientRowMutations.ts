import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  ClientMood,
  ClientStatus,
} from "@/components/clients/clientStatusMeta";

/** A folder link being typed for one client, before it is saved. */
export interface FolderLinkDraft {
  clientId: string;
  link: string;
}

/**
 * The writes the grid and table make on one client row: status, mood,
 * campaigner assignment and folder link. Each refreshes the client list.
 */
export function useClientRowMutations(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [folderLinkDraft, setFolderLinkDraft] =
    useState<FolderLinkDraft | null>(null);

  /** Refreshes the client list after a write. */
  function invalidateClients() {
    queryClient.invalidateQueries({ queryKey: ["clients", tenantId] });
  }

  const updateStatus = useMutation({
    mutationFn: async (input: { clientId: string; status: ClientStatus }) => {
      const { error } = await supabase
        .from("clients")
        .update({ status: input.status })
        .eq("id", input.clientId);
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("הסטטוס עודכן בהצלחה");
      invalidateClients();
      queryClient.invalidateQueries({
        queryKey: ["client-onboarding", tenantId],
      });
    },
    onError: () => toast.error("שגיאה בעדכון הסטטוס"),
  });

  const updateMood = useMutation({
    mutationFn: async (input: { clientId: string; moodStatus: ClientMood }) => {
      const { error } = await supabase
        .from("clients")
        .update({ mood_status: input.moodStatus })
        .eq("id", input.clientId);
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("מצב הלקוח עודכן בהצלחה");
      invalidateClients();
    },
    onError: () => toast.error("שגיאה בעדכון מצב הלקוח"),
  });

  const assignCampaigner = useMutation({
    mutationFn: async (input: { clientId: string; campaignerId: string }) => {
      const { data: existing, error: lookupError } = await supabase
        .from("client_team")
        .select("id")
        .eq("client_id", input.clientId)
        .eq("campaigner_id", input.campaignerId)
        .maybeSingle();
      if (lookupError) {
        throw lookupError;
      }
      if (existing) {
        toast.info("הקמפיינר כבר משויך ללקוח");
        return;
      }
      const { error } = await supabase.from("client_team").insert({
        client_id: input.clientId,
        campaigner_id: input.campaignerId,
      });
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("הקמפיינר שויך בהצלחה");
      invalidateClients();
    },
    onError: () => toast.error("שגיאה בשיוך הקמפיינר"),
  });

  const updateFolderLink = useMutation({
    mutationFn: async (input: FolderLinkDraft) => {
      const { error } = await supabase
        .from("clients")
        .update({ folder_link: input.link })
        .eq("id", input.clientId);
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("קישור התיקיה עודכן בהצלחה");
      invalidateClients();
      setFolderLinkDraft(null);
    },
    onError: () => toast.error("שגיאה בעדכון קישור התיקיה"),
  });

  return {
    updateStatus,
    updateMood,
    assignCampaigner,
    updateFolderLink,
    folderLinkDraft,
    setFolderLinkDraft,
  };
}

/** What the grid and table get to change a row. */
export type ClientRowMutations = ReturnType<typeof useClientRowMutations>;
