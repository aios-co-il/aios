import { useEffect } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCreativeImageUrl } from "@/components/marketing/lib/resolveCreativeImageUrl";
import { ASSET_BUCKET } from "../../../supabase/functions/_shared/workshop/assets.ts";
import type { WorkshopAsset } from "./workshopAssets";

const COLUMNS =
  "id,asset_type,source,title,url,storage_path,text,use_as_reference,meta,created_at";
const SIGNED_TTL_SECONDS = 60 * 60;

export const workshopAssetsKey = (
  tenantId: string | undefined,
  projectId: string | null,
) => ["workshop-assets", tenantId, projectId] as const;

/** entity-attachments is private: stored URLs are identifiers, the browser needs a signed link. */
async function viewable(asset: WorkshopAsset): Promise<WorkshopAsset> {
  if (asset.storage_path) {
    const { data } = await supabase.storage
      .from(ASSET_BUCKET)
      .createSignedUrl(asset.storage_path, SIGNED_TTL_SECONDS);
    if (data?.signedUrl) return { ...asset, url: data.signedUrl };
  }
  if (asset.url)
    return { ...asset, url: await resolveCreativeImageUrl(asset.url) };
  return asset;
}

/**
 * The assets of one project, kept live: what Carmen adds from a site shows up without a refresh.
 * Call it once per project view. A second call would reuse the joined realtime channel and throw.
 */
export function useWorkshopAssets(
  tenantId: string | undefined,
  projectId: string | null,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tenantId || !projectId) return;
    const channel = supabase
      .channel(`workshop-assets-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workshop_assets",
          filter: `item_id=eq.${projectId}`,
        },
        () =>
          queryClient.invalidateQueries({
            queryKey: workshopAssetsKey(tenantId, projectId),
          }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, projectId, queryClient]);

  return useQuery({
    queryKey: workshopAssetsKey(tenantId, projectId),
    queryFn:
      tenantId && projectId
        ? async (): Promise<WorkshopAsset[]> => {
            const { data, error } = await supabase
              .from("workshop_assets")
              .select(COLUMNS)
              .eq("tenant_id", tenantId)
              .eq("item_id", projectId)
              .order("created_at", { ascending: true });
            if (error) throw error;
            return Promise.all(((data ?? []) as WorkshopAsset[]).map(viewable));
          }
        : skipToken,
  });
}
