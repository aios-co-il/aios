import { useEffect, useState } from "react";
import { prefillComposer, scenePrefix } from "@/lib/workshopBridge";
import type { StoryboardGridProps } from "./StoryboardGrid";
import type { StoryboardScene } from "./storyboardScenes";
import { useEditSceneText, useWorkshopScenes } from "./useWorkshopScenes";

/**
 * The open project's storyboard on the board: its scenes, the one the user picked (which the
 * chat tells Carmen about), and the card actions (ask Carmen for a change, edit the text).
 */
export function useStoryboardBoard({
  tenantId,
  projectId,
  aspect,
  edit = false,
  onPickScene,
  openChat,
}: {
  tenantId: string | undefined;
  projectId: string | null;
  aspect: string;
  /** The film is cut from the user's materials (payload.workshop_edit). */
  edit?: boolean;
  /** A scene was picked: the board lets go of a picked page, "this" is the scene now. */
  onPickScene: () => void;
  /** Opens Carmen's session column, where the composer is. */
  openChat: () => void;
}) {
  const scenes = useWorkshopScenes(tenantId, projectId);
  const saveText = useEditSceneText(tenantId, projectId, edit);
  const [sceneId, setSceneId] = useState<string | null>(null);

  useEffect(() => {
    setSceneId(null);
  }, [projectId]);

  const list = scenes.data ?? [];
  // A scene that left the storyboard (Carmen replaced it) is no longer picked.
  const selectedScene = list.find((scene) => scene.id === sceneId) ?? null;

  const select = (scene: StoryboardScene | null) => {
    setSceneId(scene?.id ?? null);
    if (scene) onPickScene();
  };

  const storyboard: StoryboardGridProps = {
    scenes: list,
    aspect,
    loading: scenes.isLoading,
    selectedId: selectedScene?.id ?? null,
    onSelect: select,
    onComment: (scene) => {
      select(scene);
      openChat();
      prefillComposer(scenePrefix(scene.number));
    },
    onSave: (scene, patch) =>
      saveText.mutateAsync({ sceneId: scene.id, patch }),
  };

  return {
    storyboard,
    selectedScene,
    clearScene: () => setSceneId(null),
  };
}
