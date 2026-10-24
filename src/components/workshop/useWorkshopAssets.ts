import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WorkshopAsset } from "./workshopAssets";

const COLUMNS =
  "id,asset_type,source,title,url,storage_path,text,use_as_reference,meta,created_at";

/** The assets of one project, kept live: what Carmen adds from a site shows up without a refresh. */
export function useWorkshopAssets(
  tenantId: string | undefined,
  projectId: string | null,
) {
  const queryClient = useQueryClient();
  const queryKey = ["workshop-assets", tenantId, projectId];

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
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, projectId, queryClient]);

  return useQuery({
    queryKey,
    enabled: !!tenantId && !!projectId,
    queryFn: async (): Promise<WorkshopAsset[]> => {
      const { data, error } = await supabase
        .from("workshop_assets" as never)
        .select(COLUMNS)
        .eq("tenant_id", tenantId!)
        .eq("item_id", projectId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkshopAsset[];
    },
  });
}
