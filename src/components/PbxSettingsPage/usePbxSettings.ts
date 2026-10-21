import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  EMPTY_PBX_SETTINGS,
  formFromSaved,
  upsertExtension,
  type PbxExtension,
  type PbxSettingsData,
  type SetPbxField,
} from "./types";

export const pbxIntegrationKey = (tenantId: string | null | undefined) => [
  "generic-pbx-integration",
  tenantId,
];

/** Loads, edits and saves the tenant's generic PBX integration. */
export function usePbxSettings(tenantId: string | null | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PbxSettingsData>(EMPTY_PBX_SETTINGS);
  const [isActive, setIsActive] = useState(true);

  const { data: integration, isLoading } = useQuery({
    queryKey: pbxIntegrationKey(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_integrations")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("integration_type", "generic_pbx")
        .is("user_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (isLoading) return;
    setForm(formFromSaved(integration?.settings));
    setIsActive(integration ? !!integration.is_active : true);
  }, [integration, isLoading]);

  const set: SetPbxField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const setExtension = (
    userId: string,
    patch: Partial<Omit<PbxExtension, "user_id">>,
  ) =>
    setForm((prev) => ({
      ...prev,
      extensions: upsertExtension(prev.extensions, userId, patch),
    }));

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      if (form.outbound_url && !/^https?:\/\//i.test(form.outbound_url))
        throw new Error("כתובת ה-Webhook היוצא חייבת להתחיל ב-http או https");
      const settings = {
        ...form,
        extensions: form.extensions.filter((e) => e.extension.trim()),
      };
      const { error } = integration
        ? await supabase
            .from("tenant_integrations")
            .update({ settings, is_active: isActive })
            .eq("id", integration.id)
        : await supabase.from("tenant_integrations").insert({
            tenant_id: tenantId,
            integration_type: "generic_pbx",
            settings,
            is_active: isActive,
          });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pbxIntegrationKey(tenantId) });
      toast({ title: "נשמר בהצלחה", description: "הגדרות המרכזיה נשמרו" });
    },
    onError: (err: Error) =>
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      }),
  });

  return {
    integration,
    isLoading,
    form,
    set,
    setExtension,
    isActive,
    setIsActive,
    save,
  };
}
