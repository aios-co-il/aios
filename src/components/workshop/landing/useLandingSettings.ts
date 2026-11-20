import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchLandingSettings } from "./fetchLandingSettings";
import {
  type LandingSettingsDraft,
  type TrackingDraft,
} from "./landingSettings";

/** The prefix of every project's landing settings query. */
export const LANDING_SETTINGS = "workshop-landing-settings";

/** The query key of one project's landing settings. */
function landingSettingsKey(tenantId: string, itemId: string) {
  return [LANDING_SETTINGS, tenantId, itemId] as const;
}

/** A landing project's settings and the mutations that save them and its site's tracking ids. */
export function useLandingSettings(
  tenantId: string | undefined,
  itemId: string | null,
  clientId: string | null,
) {
  const queryClient = useQueryClient();
  const enabled = !!tenantId && !!itemId;

  const settings = useQuery({
    queryKey: landingSettingsKey(tenantId ?? "", itemId ?? ""),
    queryFn: enabled
      ? () => fetchLandingSettings(tenantId, itemId, clientId)
      : skipToken,
    // The tracking ids belong to the client's site, which another project may have changed
    // since this one was cached; the app's defaults keep cached data fresh for minutes.
    staleTime: 0,
    refetchOnMount: "always",
  });

  const save = useMutation({
    mutationFn: async (draft: LandingSettingsDraft) => {
      if (!enabled) {
        throw new Error("אין פרויקט פתוח");
      }
      const { error } = await supabase.rpc("landing_page_save_settings", {
        p_item_id: itemId,
        p_subdomain: draft.subdomain,
        p_slug: draft.slug,
        p_lead_to_crm: draft.leadToCrm,
        p_lead_to_webhook: draft.leadToWebhook,
        p_webhook_url: draft.webhookUrl.trim() || undefined,
      });
      if (error) {
        throw error;
      }
    },
    onSuccess: refresh,
  });

  const saveTracking = useMutation({
    mutationFn: async (draft: TrackingDraft) => {
      if (!enabled) {
        throw new Error("אין פרויקט פתוח");
      }
      const { error } = await supabase.rpc("landing_site_save_tracking", {
        p_item_id: itemId,
        p_gtm_id: draft.gtmId.trim(),
        p_ga4_id: draft.ga4Id.trim(),
        p_meta_pixel_id: draft.metaPixelId.trim(),
      });
      if (error) {
        throw error;
      }
    },
    // The ids belong to the site, which other projects of the client share: every cached
    // project reads them again.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [LANDING_SETTINGS] }),
  });

  /** Reads this project's settings again after a save. */
  function refresh() {
    return enabled
      ? queryClient.invalidateQueries({
          queryKey: landingSettingsKey(tenantId, itemId),
        })
      : undefined;
  }

  return { settings, save, saveTracking };
}
