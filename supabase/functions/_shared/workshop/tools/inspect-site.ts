import { hostLabel, isHttpUrl, untrusted } from "../assets.ts";
import { loadAssets, loadProject, savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { describeSite, siteReport, withStylesheets } from "../site-report.ts";
import { type ToolContext } from "../tool-context.ts";

export async function workshopInspectSite(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  if (!deps.fetchPublic) return { error: "קריאת אתרים לא זמינה כאן" };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const { project } = loaded;
  const assets = await loadAssets(supabase, tenantId, itemId);
  let wanted = String(args.url ?? "").trim();
  if (!wanted) {
    wanted =
      assets.find((a) => a.asset_type === "site" && a.url)?.url ??
      (typeof project.payload.client_website === "string"
        ? project.payload.client_website
        : "");
  }
  if (!wanted && project.client_id) {
    const client = await supabase
      .from("clients")
      .select("website")
      .eq("id", project.client_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    wanted = String(client.data?.website ?? "").trim();
  }
  if (!wanted)
    return {
      error:
        "אין כתובת אתר. בקשי מהמשתמש את הכתובת, או שייכי את הפרויקט ללקוח שיש לו אתר.",
    };
  const target = isHttpUrl(wanted) ? wanted : `https://${wanted}`;
  const page = await deps.fetchPublic(target, { maxBytes: 1_500_000 });
  if (!page.ok)
    return {
      error: `לא הצלחתי לקרוא את האתר: ${page.error ?? "אין תשובה"}. אפשר לבקש מהמשתמש להעלות לוגו ותמונות ידנית.`,
    };
  const html = new TextDecoder().decode(page.bytes);
  let report = siteReport(html, page.url || target);
  const styles = await Promise.all(
    report.stylesheets.slice(0, 2).map(async (sheet) => {
      const fetched = await deps.fetchPublic!(sheet, {
        maxBytes: 400_000,
        accept: "text/css,*/*",
      });
      return fetched.ok ? new TextDecoder().decode(fetched.bytes) : "";
    }),
  );
  report = withStylesheets(report, styles.filter(Boolean));
  const summary = describeSite(report);
  const existing = assets.find(
    (a) =>
      a.asset_type === "site" && (a.url === report.url || a.url === target),
  );
  const meta = {
    ...(existing?.meta ?? {}),
    inspected_at: new Date().toISOString(),
    report: {
      colors: report.colors,
      fonts: report.fonts,
      headings: report.headings,
      copy: report.copy,
      buttons: report.buttons,
      logo: report.logo,
      images: report.images,
      social: report.social,
    },
  };
  const savedSite = existing
    ? await supabase
        .from("workshop_assets")
        .update({ text: summary, meta })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId)
    : await supabase.from("workshop_assets").insert({
        tenant_id: tenantId,
        item_id: itemId,
        asset_type: "site",
        source: "carmen",
        title: `האתר · ${hostLabel(report.url)}`,
        url: report.url,
        text: summary,
        meta,
      });
  if (savedSite.error) return { error: savedSite.error.message };
  let applied = false;
  let logoUrl: string | null = null;
  let logoError: string | null = null;
  const brand = asRecord(project.payload.brand_book);
  const nextPayload: Record<string, unknown> = { ...project.payload };
  if (
    typeof nextPayload.client_website !== "string" ||
    !nextPayload.client_website
  )
    nextPayload.client_website = report.url;
  if (args.apply_brand === true) {
    nextPayload.brand_book = {
      ...brand,
      colors: report.colors.length > 0 ? report.colors : (brand.colors ?? []),
      fonts: report.fonts.length > 0 ? report.fonts : brand.fonts,
      notes: String(brand.notes ?? "") || summary.slice(0, 600),
      source: "auto",
    };
    // A copy in storage, as workshop_add_assets keeps a picture: the render worker reads only
    // storage and known media hosts, so the site's own link would leave the end card bare.
    if (report.logo && !nextPayload.logo_url) {
      const copied = deps.importImage
        ? await deps.importImage(report.logo, { tenantId, itemId })
        : { error: "ייבוא תמונות לא זמין כאן" };
      if (copied.url) nextPayload.logo_url = logoUrl = copied.url;
      else logoError = copied.error ?? "הלוגו לא נקרא";
    }
    applied = true;
  }
  if (applied || nextPayload.client_website !== project.payload.client_website)
    await savePayload(supabase, tenantId, itemId, nextPayload);
  return {
    success: true,
    url: report.url,
    language: report.lang || undefined,
    colors: report.colors,
    fonts: report.fonts,
    site_content: untrusted({
      title: report.title,
      description: report.description,
      headings: report.headings,
      copy_samples: report.copy,
      buttons: report.buttons,
    }),
    logo: report.logo,
    images: report.images.slice(0, 8),
    brand_applied: applied,
    ...(logoUrl ? { logo_url: logoUrl } : {}),
    ...(logoError ? { logo_error: logoError } : {}),
    message: `קראתי את האתר ושמרתי את הדוח בלשונית הנכסים. הציגי למשתמש במשפט אחד מה מצאת (צבעים, סגנון כתיבה) והציעי להשתמש בזה. תמונה מהאתר שמרי עם workshop_add_assets.${
      logoError
        ? ` הלוגו מהאתר לא נשמר (${logoError}): בקשי מהמשתמש להעלות את הלוגו.`
        : ""
    }`,
    workshop: { event: "artifacts", item_id: itemId },
  };
}
