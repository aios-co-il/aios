import { syncClientAssets } from "../assets.ts";
import { loadProject, publicUrlOf } from "../project-io.ts";
import { type ToolContext } from "../tool-context.ts";

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
  if (assigned.error) return { error: assigned.error.message };
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
