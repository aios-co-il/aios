import { hostLabel, isHttpUrl } from "../assets.ts";
import { loadAssets, loadProject } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";

export async function workshopAddAssets(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  const requested = (Array.isArray(args.assets) ? args.assets : []).slice(
    0,
    8,
  );
  if (requested.length === 0) return { error: "assets נדרש" };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const existing = await loadAssets(supabase, tenantId, itemId);
  const byUrl = new Map(existing.map((a) => [a.url, a]));
  const added: { title: string; type: string }[] = [];
  const failed: { url?: string; reason: string }[] = [];
  let referenceCount = existing.filter(
    (a) => a.asset_type === "image" && a.use_as_reference,
  ).length;
  for (const entry of requested) {
    const item = asRecord(entry);
    const kind = String(item.kind ?? "");
    const title = String(item.title ?? "")
      .trim()
      .slice(0, 120);
    const url = String(item.url ?? "").trim();
    let wantsReference = item.use_as_reference === true;
    if (kind === "text") {
      const text = String(item.text ?? "")
        .trim()
        .slice(0, 8000);
      if (!text) {
        failed.push({ reason: "טקסט ריק" });
        continue;
      }
      const savedText = await supabase.from("workshop_assets").insert({
        tenant_id: tenantId,
        item_id: itemId,
        asset_type: "text",
        source: "carmen",
        title: title || "בריף",
        text,
      });
      if (savedText.error) {
        failed.push({
          url: title || "בריף",
          reason: savedText.error.message,
        });
        continue;
      }
      added.push({ title: title || "בריף", type: "text" });
      continue;
    }
    if (!isHttpUrl(url)) {
      failed.push({ url, reason: "הקישור לא תקין" });
      continue;
    }
    if (kind === "link") {
      if (!byUrl.has(url)) {
        const savedLink = await supabase.from("workshop_assets").insert({
          tenant_id: tenantId,
          item_id: itemId,
          asset_type: "link",
          source: "carmen",
          title: title || hostLabel(url),
          url,
        });
        if (savedLink.error) {
          failed.push({ url, reason: savedLink.error.message });
          continue;
        }
        added.push({ title: title || hostLabel(url), type: "link" });
      }
      continue;
    }
    if (kind !== "image") {
      failed.push({ url, reason: "סוג לא מוכר" });
      continue;
    }
    if (wantsReference && referenceCount >= 4) {
      wantsReference = false;
    }
    const known = byUrl.get(url);
    if (known) {
      if (wantsReference && !known.use_as_reference) {
        const marked = await supabase
          .from("workshop_assets")
          .update({ use_as_reference: true })
          .eq("id", known.id)
          .eq("tenant_id", tenantId);
        if (marked.error) failed.push({ url, reason: marked.error.message });
        else referenceCount += 1;
      }
      continue;
    }
    if (!deps.importImage) {
      failed.push({ url, reason: "ייבוא תמונות לא זמין כאן" });
      continue;
    }
    const imported = await deps.importImage(url, { tenantId, itemId });
    if (!imported.url) {
      failed.push({ url, reason: imported.error ?? "התמונה לא נקראה" });
      continue;
    }
    const savedImage = await supabase.from("workshop_assets").insert({
      tenant_id: tenantId,
      item_id: itemId,
      asset_type: "image",
      source: "carmen",
      title: title || hostLabel(url),
      url: imported.url,
      storage_path: imported.path ?? null,
      use_as_reference: wantsReference,
      meta: { imported_from: url },
    });
    if (savedImage.error) {
      failed.push({ url, reason: savedImage.error.message });
      continue;
    }
    if (wantsReference) referenceCount += 1;
    added.push({ title: title || hostLabel(url), type: "image" });
  }
  return {
    success: failed.length < requested.length,
    added,
    failed,
    message:
      added.length > 0
        ? `נוספו ${added.length} נכסים ללשונית הנכסים.${failed.length > 0 ? ` ${failed.length} לא נקלטו.` : ""}`
        : "לא נוסף שום נכס. אמרי למשתמש למה בפשטות.",
    workshop: { event: "artifacts", item_id: itemId },
  };
}
