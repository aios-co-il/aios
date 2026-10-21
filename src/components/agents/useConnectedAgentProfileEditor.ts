import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadProfileImage } from "@/lib/profileAvatars";
import {
  CONNECTED_AGENT_PROFILES_KEY,
  readProfile,
  type Profile,
  type RouteRow,
} from "./connectedAgentProfile";

export function useConnectedAgentProfileEditor(
  tenantId: string | null | undefined,
) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [draft, setDraft] = useState<Profile>({});
  const [file, setFile] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!editing || !tenantId) return;
      let avatarPath = draft.avatarPath;
      if (file)
        avatarPath = await uploadProfileImage(
          tenantId,
          `routes/${editing.id}`,
          file,
        );
      // Re-read config so provider settings written elsewhere are preserved.
      const { data: fresh, error: readError } = await supabase
        .from("agent_brain_routes")
        .select("config")
        .eq("id", editing.id)
        .eq("tenant_id", tenantId)
        .single();
      if (readError) throw readError;
      const config = {
        ...((fresh?.config as object) ?? {}),
        profile: { ...draft, avatarPath },
      };
      const { error } = await supabase
        .from("agent_brain_routes")
        .update({ config })
        .eq("id", editing.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הפרופיל נשמר");
      setEditing(null);
      qc.invalidateQueries({
        queryKey: [CONNECTED_AGENT_PROFILES_KEY, tenantId],
      });
    },
    onError: (e: any) => toast.error("שמירה נכשלה: " + (e?.message || e)),
  });

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : undefined),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const open = (r: RouteRow) => {
    setEditing(r);
    setDraft(readProfile(r.config));
    setFile(null);
  };
  const close = () => setEditing(null);

  return {
    editing,
    draft,
    setDraft,
    file,
    setFile,
    preview,
    save,
    open,
    close,
  };
}

export type ConnectedAgentProfileEditor = ReturnType<
  typeof useConnectedAgentProfileEditor
>;
