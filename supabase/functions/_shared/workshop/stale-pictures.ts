/** Pictures that a cut-off request left spinning on the board. */

// deno-lint-ignore no-explicit-any
type Db = any;

/** A picture page still pending after this was cut off: the request making it has ended. */
const STALE_PICTURE_MS = 5 * 60_000;

/** Turns pictures a cut-off request left spinning on the board into failed pages. */
export async function failStalePictures(
  supabase: Db,
  tenantId: string,
  itemId: string,
  now = Date.now(),
) {
  await supabase
    .from("workshop_artifacts")
    .update({
      status: "failed",
      meta: { text: "נקטע לפני שהסתיים. אפשר לבקש שוב." },
    })
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("status", "pending")
    .eq("meta->>placeholder", "true")
    .in("kind", ["image", "scene_still"])
    .lt("created_at", new Date(now - STALE_PICTURE_MS).toISOString());
}
