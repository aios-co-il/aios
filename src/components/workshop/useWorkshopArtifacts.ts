import { useEffect } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signCreativeVideoPaths } from "@/components/marketing/departments/creative/videoScenesStore";
import { resolveCreativeImageUrl } from "@/components/marketing/lib/resolveCreativeImageUrl";
import {
  splitFailures,
  storagePathsIn,
  withSignedUrls,
  type WorkshopArtifact,
} from "./workshopFeed";

const cleared = new Set<string>();

async function clearFailures(
  tenantId: string,
  rows: WorkshopArtifact[],
): Promise<WorkshopArtifact[]> {
  const { kept, failedIds } = splitFailures(rows);
  const fresh = failedIds.filter((id) => !cleared.has(id));
  if (fresh.length === 0) return kept;
  fresh.forEach((id) => cleared.add(id));
  splitFailures(rows.filter((row) => fresh.includes(row.id)))
    .messages.slice(0, 3)
    .forEach((message) => toast.error(message, { duration: 12_000 }));
  await supabase
    .from("workshop_artifacts")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", fresh);
  return kept;
}

const COLUMNS =
  "id,item_id,kind,folder,title,status,url,thumb_url,meta,created_at";

/** A page of the user's own upload links to the private entity-attachments bucket: signed to show. */
const withViewableUploads = (rows: WorkshopArtifact[]) =>
  Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await resolveCreativeImageUrl(row.url),
      thumb_url: await resolveCreativeImageUrl(row.thumb_url),
    })),
  );

/** The pages of one project, kept live: a page Carmen adds arrives without a refresh. */
export function useWorkshopArtifacts(
  tenantId: string | undefined,
  projectId: string | null,
) {
  const queryClient = useQueryClient();
  const queryKey = ["workshop-artifacts", tenantId, projectId];

  useEffect(() => {
    if (!tenantId || !projectId) return;
    const channel = supabase
      .channel(`workshop-artifacts-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workshop_artifacts",
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
    queryFn:
      tenantId && projectId
        ? async (): Promise<WorkshopArtifact[]> => {
            const { data, error } = await supabase
              .from("workshop_artifacts")
              .select(COLUMNS)
              .eq("tenant_id", tenantId)
              .eq("item_id", projectId)
              .order("created_at", { ascending: true });
            if (error) throw error;
            const rows = await clearFailures(
              tenantId,
              (data ?? []) as WorkshopArtifact[],
            );
            const paths = storagePathsIn(rows);
            if (paths.length === 0) return withViewableUploads(rows);
            const signed = await signCreativeVideoPaths(paths).catch(
              () => ({}),
            );
            return withViewableUploads(withSignedUrls(rows, signed));
          }
        : skipToken,
  });
}
