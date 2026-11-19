import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  siteTrackingOf,
  type TrackingColumns,
} from "../../../../supabase/functions/_shared/workshop/landing/site-tracking.ts";
import {
  HOME_SLUG,
  type LandingSettings,
  type LandingSettingsDraft,
  NO_TRACKING,
  type TrackingDraft,
} from "./landingSettings";

/** The site columns the panel reads: its address and its tracking ids. */
const SITE_COLUMNS = "subdomain, gtm_id, ga4_id, meta_pixel_id" as const;

/** The query key of one project's landing settings. */
function landingSettingsKey(tenantId: string, itemId: string) {
  return ["workshop-landing-settings", tenantId, itemId] as const;
}

/** Reads the project's page, or the client's site when the project has no page yet. */
async function fetchLandingSettings(
  tenantId: string,
  itemId: string,
  clientId: string | null,
): Promise<LandingSettings> {
  const { data: page, error } = await supabase
    .from("landing_pages")
    .select(
      `slug, lead_to_crm, lead_to_webhook, landing_sites(${SITE_COLUMNS})` as const,
    )
    .eq("tenant_id", tenantId)
    .eq("work_item_id", itemId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (page) {
    return {
      subdomain: page.landing_sites.subdomain,
      slug: page.slug,
      leadToCrm: page.lead_to_crm,
      leadToWebhook: page.lead_to_webhook,
      siteExists: true,
      pageExists: true,
      tracking: trackingOf(page.landing_sites),
    };
  }

  const empty: LandingSettings = {
    subdomain: "",
    slug: HOME_SLUG,
    leadToCrm: false,
    leadToWebhook: false,
    siteExists: false,
    pageExists: false,
    tracking: NO_TRACKING,
  };
  if (!clientId) {
    return empty;
  }
  const { data: site, error: siteError } = await supabase
    .from("landing_sites")
    .select(SITE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (siteError) {
    throw siteError;
  }
  return site
    ? {
        ...empty,
        subdomain: site.subdomain,
        siteExists: true,
        tracking: trackingOf(site),
      }
    : empty;
}

/** A site row's tracking ids, with an empty string for each id that is not set. */
function trackingOf(site: TrackingColumns): TrackingDraft {
  return { ...NO_TRACKING, ...siteTrackingOf(site) };
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
    onSuccess: refresh,
  });

  /** Reads the settings again after a save. */
  function refresh() {
    return enabled
      ? queryClient.invalidateQueries({
          queryKey: landingSettingsKey(tenantId, itemId),
        })
      : undefined;
  }

  return { settings, save, saveTracking };
}
