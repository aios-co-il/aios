import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "./useCurrentTenant";
import {
  readActiveSkin,
  readSkinAvatars,
  signProfileImage,
  uploadProfileImage,
} from "@/lib/profileAvatars";

export type CarmenSkinOption = {
  slug: string;
  name: string;
  description: string | null;
  avatarUrl?: string;
};

type AgentRow = { id: string; metadata: Record<string, any> | null };

/** Carmen's skins with per-skin avatars and the active skin, all tenant-scoped via Carmen's own agent row. */
export function useCarmenSkins() {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();

  const agentQuery = useQuery({
    queryKey: ["carmen-skins-agent", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<AgentRow | null> => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("id,metadata")
        .eq("tenant_id", tenantId!)
        .or("name.ilike.%carmen%,name.ilike.%כרמן%")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AgentRow | null;
    },
  });

  const skinsQuery = useQuery({
    queryKey: [
      "carmen-skins-options",
      tenantId,
      JSON.stringify(readSkinAvatars(agentQuery.data?.metadata)),
    ],
    enabled: !!tenantId && agentQuery.isSuccess,
    queryFn: async (): Promise<CarmenSkinOption[]> => {
      const { data, error } = await supabase
        .from("ai_skills" as any)
        .select("slug,name,description,scope")
        .eq("is_active", true)
        .or(`scope.eq.global,and(scope.eq.tenant,tenant_id.eq.${tenantId})`)
        .order("name");
      if (error) throw error;
      const bySlug = new Map<string, any>();
      // Tenant rows override the global skin with the same slug.
      for (const row of (data as any[]) ?? [])
        if (row.scope === "tenant" || !bySlug.has(row.slug))
          bySlug.set(row.slug, row);
      const avatars = readSkinAvatars(agentQuery.data?.metadata);
      return Promise.all(
        [...bySlug.values()].map(async (r) => ({
          slug: r.slug,
          name: r.name,
          description: r.description ?? null,
          avatarUrl: await signProfileImage(
            tenantId!,
            avatars[r.slug]?.avatarPath,
          ),
        })),
      );
    },
  });

  const patchMetadata = useMutation({
    mutationFn: async (
      patch: (m: Record<string, any>) => Record<string, any>,
    ) => {
      const agent = agentQuery.data;
      if (!agent || !tenantId) throw new Error("לא נמצא סוכן כרמן");
      // Re-read so concurrent edits to other metadata keys are not clobbered.
      const { data: fresh, error: readError } = await supabase
        .from("ai_agents")
        .select("metadata")
        .eq("id", agent.id)
        .eq("tenant_id", tenantId)
        .single();
      if (readError) throw readError;
      const next = patch({ ...((fresh?.metadata as object) ?? {}) });
      const { error } = await supabase
        .from("ai_agents")
        .update({ metadata: next })
        .eq("id", agent.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return next;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["carmen-skins-agent", tenantId] });
      qc.invalidateQueries({ queryKey: ["carmen-identity", tenantId] });
      qc.invalidateQueries({ queryKey: ["ai-agents", tenantId] });
    },
  });

  const skins = skinsQuery.data ?? [];
  const activeSlug = readActiveSkin(agentQuery.data?.metadata);

  const setActiveSkin = useCallback(
    async (slug: string | null) => {
      // Optimistic: swap the visible character before the write round-trips.
      const url = skins.find((s) => s.slug === slug)?.avatarUrl;
      qc.setQueryData(["carmen-identity", tenantId], (prev: any) =>
        prev ? { ...prev, activeSkin: slug, skinAvatarUrl: url } : prev,
      );
      qc.setQueryData(["carmen-skins-agent", tenantId], (prev: any) =>
        prev
          ? { ...prev, metadata: { ...prev.metadata, active_skin: slug } }
          : prev,
      );
      await patchMetadata.mutateAsync((m) => ({ ...m, active_skin: slug }));
    },
    [skins, qc, tenantId, patchMetadata],
  );

  const setSkinAvatar = useCallback(
    async (slug: string, file: File | null) => {
      if (!tenantId) throw new Error("missing tenant");
      const path = file
        ? await uploadProfileImage(tenantId, `skins/${slug}`, file)
        : null;
      await patchMetadata.mutateAsync((m) => {
        const vi = { ...(m.visual_identity ?? {}) };
        const map = { ...(vi.skins ?? {}) };
        if (path) map[slug] = { avatarPath: path };
        else delete map[slug];
        return { ...m, visual_identity: { ...vi, skins: map } };
      });
    },
    [tenantId, patchMetadata],
  );

  return {
    skins,
    activeSlug,
    isLoading: agentQuery.isLoading || skinsQuery.isLoading,
    setActiveSkin,
    setSkinAvatar,
    canEdit: !!agentQuery.data,
  };
}
