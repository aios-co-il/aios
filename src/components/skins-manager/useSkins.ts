import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { SKIN_FIELDS, type Skin, type SkinDraft } from "./types";

/**
 * Loads the global catalog plus this tenant's overrides, and saves a draft
 * (update by id, or insert as a new tenant skin).
 */
export function useSkins(
  tenantId: string | null | undefined,
  onSaved: () => void,
) {
  const queryClient = useQueryClient();

  const { data: skins, isLoading } = useQuery({
    queryKey: ["skins-manager", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_skills")
        .select(SKIN_FIELDS)
        .or(
          tenantId
            ? `scope.eq.global,and(scope.eq.tenant,tenant_id.eq.${tenantId})`
            : "scope.eq.global",
        )
        .order("scope", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Skin[];
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (s: SkinDraft) => {
      // description and steps are NOT NULL columns.
      const payload: TablesUpdate<"ai_skills"> & {
        description: string;
        steps: string;
      } = {
        name: s.name,
        description: s.description ?? "",
        goal: s.goal ?? null,
        constraints: s.constraints ?? null,
        system_prompt: s.system_prompt ?? null,
        output_template: s.output_template ?? null,
        steps: s.steps ?? "",
        allowed_tools: s.allowed_tools ?? [],
        triggers: s.triggers ?? [],
        handoff_slugs: s.handoff_slugs ?? [],
        model: s.model ?? null,
        is_active: s.is_active ?? true,
      };
      if (s.id) {
        const { error } = await supabase
          .from("ai_skills")
          .update(payload)
          .eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_skills").insert({
          ...payload,
          name: s.name ?? "",
          slug: s.slug,
          scope: "tenant",
          tenant_id: tenantId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("הסקין נשמר");
      onSaved();
      queryClient.invalidateQueries({ queryKey: ["skins-manager", tenantId] });
    },
    onError: (e: Error) => toast.error("שמירה נכשלה: " + e.message),
  });

  return { skins, isLoading, saveMutation };
}
