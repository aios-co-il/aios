import type { GetCarmenSkinsArgs } from "./skill-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { customSkinPaths } from "../../_shared/carmen/skin-gallery.ts";
import { pathsToSign } from "../../_shared/carmen/skin-gallery.ts";
import { carmenSkinsResult } from "../../_shared/carmen/skin-gallery.ts";
import { carmenSkinEntries } from "../../_shared/carmen/skin-gallery.ts";
import { appOrigin } from "../../_shared/carmen/skin-gallery.ts";

/** Preserves the existing get_carmen_skins executor and side-effect order. */
export async function executeGetCarmenSkins(
  args: GetCarmenSkinsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, appLinkOrigin } = context;

  // The tenant's Carmen agent holds the custom skin images (visual_identity.skins).
  const { data: carmenAgent } = await supabase
    .from("ai_agents")
    .select("metadata")
    .eq("tenant_id", tenantId)
    .or("name.ilike.%carmen%,name.ilike.%כרמן%")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const paths = customSkinPaths(carmenAgent?.metadata, tenantId);
  const signed: Record<string, string> = {};
  await Promise.all(
    pathsToSign(paths).map(async (path) => {
      const { data, error } = await supabase.storage
        .from("entity-attachments")
        .createSignedUrl(path, 3600);
      if (!error && data?.signedUrl) {
        signed[path] = data.signedUrl;
      }
    }),
  );
  return carmenSkinsResult(
    carmenSkinEntries(paths, signed),
    appOrigin(appLinkOrigin, Deno.env.get("APP_URL")),
  );
}
