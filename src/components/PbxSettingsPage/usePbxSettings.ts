import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  EMPTY_PBX_SETTINGS,
  formFromSaved,
  toPbxRow,
  upsertExtension,
  type PbxExtension,
  type PbxSettingsData,
  type SetPbxField,
} from "./types";

export const pbxSettingsKey = (tenantId: string | null | undefined) => [
  "pbx-settings",
  tenantId,
];

/** Loads, edits and saves the tenant's PBX settings (managers only, by RLS). */
export function usePbxSettings(tenantId: string | null | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PbxSettingsData>(EMPTY_PBX_SETTINGS);
  const [isActive, setIsActive] = useState(true);

  const { data: saved, isLoading } = useQuery({
    queryKey: pbxSettingsKey(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pbx_settings")
        .select("is_active, config, inbound_secret, outbound_auth_value")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (isLoading) return;
    setForm(formFromSaved(saved ?? null));
    setIsActive(saved ? saved.is_active : true);
  }, [saved, isLoading]);

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
      const { error } = await supabase
        .from("pbx_settings")
        .upsert(
          { tenant_id: tenantId, is_active: isActive, ...toPbxRow(form) },
          { onConflict: "tenant_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pbxSettingsKey(tenantId) });
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
    saved,
    isLoading,
    form,
    set,
    setExtension,
    isActive,
    setIsActive,
    save,
  };
}
