import { artifactWebLink, loadSelectedArtifact } from "../selected-artifact.ts";
import type { ToolContext } from "../tool-context.ts";

/**
 * The project picture a film is made from (from_artifact_id), as the reference every scene
 * without its own picture is drawn from. On Staging a user asked for a video of the image they
 * marked, and Carmen asked them for a reference instead of using that image.
 */
export async function storyboardSource(
  ctx: Pick<ToolContext, "supabase" | "tenantId" | "args">,
  itemId: string,
): Promise<{ url: string | null } | { error: string }> {
  const artifactId = String(ctx.args.from_artifact_id ?? "").trim();
  if (!artifactId) {
    return { url: null };
  }
  const artifact = await loadSelectedArtifact(
    ctx.supabase,
    ctx.tenantId,
    itemId,
    artifactId,
  );
  const url = artifact ? artifactWebLink(artifact) : null;
  if (!url) {
    return {
      error:
        "from_artifact_id: אין בפרויקט הזה תמונה עם המזהה הזה וקישור שאפשר להשתמש בו. בדקי עם workshop_get_state.",
    };
  }
  return { url };
}

/** A scene keeps its own picture; any other scene is drawn from the source picture. */
export function withSourcePicture<T extends { reference_url?: string }>(
  scene: T,
  sourceUrl: string | null,
): T {
  if (scene.reference_url || !sourceUrl) {
    return scene;
  }
  return { ...scene, reference_url: sourceUrl };
}
