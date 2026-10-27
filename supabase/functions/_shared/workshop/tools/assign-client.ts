import { syncClientAssets } from "../assets.ts";
import { assignClientErrorMessage } from "../departments.ts";
import { loadProject, publicUrlOf } from "../project-io.ts";
import { type ToolContext } from "../tool-context.ts";

/** Assigns, moves or releases a project of any department (workshop_assign_client). */
export async function workshopAssignClient(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const wanted = String(args.client_id ?? "").trim() || null;
  if (wanted) {
    try {
      await assertClientAccess(wanted);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
      };
    }
  }
  const assigned = await supabase.rpc("workshop_assign_client", {
    p_item_id: itemId,
    p_client_id: wanted,
  });
  // The RPC explains its refusals in Hebrew (an SEO project locked to its client, say).
  if (assigned.error)
    return { error: assignClientErrorMessage(assigned.error, true) };
  // Only a workshop board has an assets tab to fill with the client's material.
  if (!("workshop" in loaded.project.payload))
    return {
      success: true,
      item_id: itemId,
      client_id: wanted,
      message: wanted
        ? "הפרויקט שויך ללקוח."
        : "השיוך ללקוח הוסר. הפרויקט נשאר בלי לקוח.",
      workshop: { event: "artifacts", item_id: itemId },
    };
  const synced = await syncClientAssets(
    supabase,
    { tenantId, itemId, clientId: wanted },
    publicUrlOf(supabase),
  );
  return {
    success: true,
    item_id: itemId,
    client_id: wanted,
    client_assets: synced.added,
    message: wanted
      ? synced.added > 0
        ? `הפרויקט שויך ללקוח, ונכנסו ללשונית הנכסים ${synced.added} נכסים שלו (בריף, אתר, קבצים).`
        : "הפרויקט שויך ללקוח. אין ללקוח בריף, אתר או קבצים להעביר."
      : "השיוך ללקוח הוסר. הפרויקט נשאר בלי לקוח.",
    workshop: { event: "artifacts", item_id: itemId },
  };
}
