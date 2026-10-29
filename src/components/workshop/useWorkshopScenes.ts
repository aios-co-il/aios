import { useEffect } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { signCreativeVideoPaths } from "@/components/marketing/departments/creative/videoScenesStore";
import { resolveCreativeImageUrl } from "@/components/marketing/lib/resolveCreativeImageUrl";
import { subscribeWorkshopEvents } from "@/lib/workshopBridge";
import {
  filmInProductionMessage,
  isFilmInProduction,
} from "./filmInProduction";
import {
  type PageScene,
  storyboardPageWith,
} from "../../../supabase/functions/_shared/workshop/storyboard-text.ts";
import {
  BOARD_SCENE_COLUMNS,
  applySceneEdit,
  storyboardScenes,
  type SceneAsset,
  type SceneRow,
  type SceneTextPatch,
  type StoryboardScene,
} from "./storyboardScenes";

export const scenesQueryKey = (
  tenantId: string | undefined,
  projectId: string | null,
) => ["workshop-scenes", tenantId, projectId] as const;

const isStoragePath = (url: string | null): url is string =>
  !!url && !/^(https?:|data:|blob:)/i.test(url);

async function loadScenes(
  tenantId: string,
  projectId: string,
): Promise<StoryboardScene[]> {
  const { data, error } = await supabase
    .from("marketing_video_scenes")
    .select(BOARD_SCENE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("item_id", projectId)
    .order("position");
  if (error) throw error;
  const rows = (data ?? []) as SceneRow[];
  const ids = [
    ...new Set(
      rows
        .flatMap((row) => [row.still_asset_id, row.clip_asset_id])
        .filter((id): id is string => !!id),
    ),
  ];
  const assets = new Map<string, SceneAsset>();
  if (ids.length > 0) {
    const { data: found, error: assetError } = await supabase
      .from("marketing_assets")
      .select("id,url")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (assetError) throw assetError;
    const list = (found ?? []) as SceneAsset[];
    // Clips live in the private creative-video bucket as paths; pictures are mostly links, and
    // the user's own uploads are links to the private entity-attachments bucket.
    const paths = [...new Set(list.map((a) => a.url).filter(isStoragePath))];
    const signed =
      paths.length > 0
        ? await signCreativeVideoPaths(paths).catch(
            () => ({}) as Record<string, string>,
          )
        : {};
    for (const asset of list)
      assets.set(asset.id, {
        id: asset.id,
        url: isStoragePath(asset.url)
          ? (signed[asset.url] ?? null)
          : await resolveCreativeImageUrl(asset.url),
      });
  }
  return storyboardScenes(rows, assets);
}

/**
 * The open project's storyboard, kept live: a scene Carmen changes (workshop_update_scene, a
 * new still or clip from the worker) reaches the grid without a refresh.
 */
export function useWorkshopScenes(
  tenantId: string | undefined,
  projectId: string | null,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tenantId || !projectId) return;
    const queryKey = scenesQueryKey(tenantId, projectId);
    const refresh = () => void queryClient.invalidateQueries({ queryKey });
    const channel = supabase
      .channel(`workshop-scenes-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "marketing_video_scenes",
          filter: `item_id=eq.${projectId}`,
        },
        refresh,
      )
      .subscribe();
    const stop = subscribeWorkshopEvents((event) => {
      if (event.item_id === projectId) refresh();
    });
    return () => {
      stop();
      void supabase.removeChannel(channel);
    };
  }, [tenantId, projectId, queryClient]);

  return useQuery({
    queryKey: scenesQueryKey(tenantId, projectId),
    queryFn:
      tenantId && projectId ? () => loadScenes(tenantId, projectId) : skipToken,
  });
}

/**
 * The storyboard page on the board lists the scenes as written: after an edit it shows the new
 * texts too, as after Carmen's change (workshop_update_scene). Cosmetic: the scene is saved.
 */
async function refreshStoryboardPage(
  tenantId: string,
  projectId: string,
  scene: PageScene,
  edit: boolean,
) {
  try {
    const { data } = await supabase
      .from("workshop_artifacts")
      .select("id, meta")
      .eq("tenant_id", tenantId)
      .eq("item_id", projectId)
      .eq("kind", "storyboard")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const meta = data ? storyboardPageWith(data.meta, scene, edit) : null;
    if (!data || !meta) return;
    await supabase
      .from("workshop_artifacts")
      .update({ meta: meta as Json })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
  } catch {
    // The page catches up with the next storyboard; the scene itself is saved.
  }
}

/**
 * Saves the texts the user changed on one scene (on-screen text, narration, dialogue). The card
 * shows them at once; a failed save puts the old texts back and says so. `edit`: the film is cut
 * from the user's materials (payload.workshop_edit), whose storyboard page shows no frame text.
 */
export function useEditSceneText(
  tenantId: string | undefined,
  projectId: string | null,
  edit = false,
) {
  const queryClient = useQueryClient();
  const queryKey = scenesQueryKey(tenantId, projectId);
  return useMutation({
    mutationFn: async ({
      sceneId,
      patch,
    }: {
      sceneId: string;
      patch: SceneTextPatch;
    }) => {
      // A text left out keeps its field (the function's null default).
      const { data: scene, error } = await supabase.rpc(
        "workshop_edit_scene_text",
        {
          p_scene_id: sceneId,
          p_overlay_text: patch.overlay_text,
          p_voiceover_text: patch.voiceover_text,
          p_dialogue: patch.dialogue,
        },
      );
      if (error) throw error;
      if (tenantId && projectId && scene?.id)
        await refreshStoryboardPage(tenantId, projectId, scene, edit);
    },
    onMutate: async ({ sceneId, patch }) => {
      await queryClient.cancelQueries({ queryKey });
      const before = queryClient.getQueryData<StoryboardScene[]>(queryKey);
      if (before)
        queryClient.setQueryData(
          queryKey,
          applySceneEdit(before, sceneId, patch),
        );
      return { before };
    },
    onError: (error, _vars, context) => {
      if (context?.before) queryClient.setQueryData(queryKey, context.before);
      toast.error(
        isFilmInProduction(error)
          ? filmInProductionMessage("את הטקסט")
          : "לא הצלחנו לשמור את הטקסט של הסצנה",
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
