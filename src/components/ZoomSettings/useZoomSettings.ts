import { useEffect, useState } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ZoomSettingsValues = Record<string, string>;

export interface ZoomCredentials {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

/** The tenant's Zoom credentials: the stored row, the form values and a save action. */
export function useZoomSettings(tenantId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ZoomCredentials>({
    accountId: "",
    clientId: "",
    clientSecret: "",
  });

  const { data: integration } = useZoomIntegration(tenantId);

  const storedSettings = (integration?.settings ?? {}) as ZoomSettingsValues;

  useEffect(() => {
    setForm({
      accountId: storedSettings.account_id || "",
      clientId: storedSettings.client_id || "",
      clientSecret: storedSettings.client_secret || "",
    });
    // Seed the form once per loaded row, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) {
        throw new Error("No tenant");
      }
      // Keep keys this page does not edit (for example an old webhook token).
      const settings: ZoomSettingsValues = {
        ...storedSettings,
        account_id: form.accountId,
        client_id: form.clientId,
        client_secret: form.clientSecret,
      };
      const { error } = integration
        ? await supabase
            .from("tenant_integrations")
            .update({ settings, is_active: true })
            .eq("id", integration.id)
        : await supabase.from("tenant_integrations").insert({
            tenant_id: tenantId,
            integration_type: "zoom",
            settings,
            is_active: true,
          });
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["zoom-integration", tenantId],
      });
      toast({ title: "נשמר בהצלחה", description: "הגדרות Zoom נשמרו" });
    },
    onError: (err: Error) => {
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return {
    form,
    setForm,
    isConnected: !!integration?.is_active,
    save,
  };
}

/** The tenant's Zoom integration row (null when it has none), shared by the settings page and the Integrations card. */
export function useZoomIntegration(tenantId: string | null) {
  return useQuery({
    queryKey: ["zoom-integration", tenantId],
    queryFn: tenantId ? () => fetchZoomIntegration(tenantId) : skipToken,
  });
}

/** The tenant's Zoom integration row, or null when it has none. */
async function fetchZoomIntegration(tenantId: string) {
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("id, is_active, settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "zoom")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}
