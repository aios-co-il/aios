import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SKIN_FIELDS, type Skin, type SkinDraft } from "./types";

// Loads the global catalog plus this tenant's overrides, and saves a draft
// (update by id, or insert as a new tenant skin).
export function useSkins(
  tenantId: string | null | undefined,
  onSaved: () => void,
) {
  const queryClient = useQueryClient();

  const { data: skins, isLoading } = useQuery({
    queryKey: ["skins-manager", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_skills" as any)
        .select(SKIN_FIELDS)
        .or(
          tenantId
            ? `scope.eq.global,and(scope.eq.tenant,tenant_id.eq.${tenantId})`
            : "scope.eq.global",
        )
        .order("scope", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as any as Skin[]) || [];
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (s: SkinDraft) => {
      const payload: any = {
        name: s.name,
        description: s.description ?? null,
        goal: s.goal ?? null,
        constraints: s.constraints ?? null,
        system_prompt: s.system_prompt ?? null,
        output_template: s.output_template ?? null,
        steps: s.steps ?? null,
        allowed_tools: s.allowed_tools ?? [],
        triggers: s.triggers ?? [],
        handoff_slugs: s.handoff_slugs ?? [],
        model: s.model ?? null,
        is_active: s.is_active ?? true,
      };
      if (s.id) {
        const { error } = await supabase
          .from("ai_skills" as any)
          .update(payload)
          .eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_skills" as any).insert({
          ...payload,
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
    onError: (e: any) => toast.error("שמירה נכשלה: " + (e?.message || e)),
  });

  return { skins, isLoading, saveMutation };
}
