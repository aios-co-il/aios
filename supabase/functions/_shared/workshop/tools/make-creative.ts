import { spendBudget } from "../budget.ts";
import { estimateImages, imageFormatsFrom } from "../defaults.ts";
import { gatePaid, refundMissing } from "../gate.ts";
import { lookOf, stillPrompt } from "../look.ts";
import {
  failedPatch,
  openPlaceholders,
  settlePlaceholder,
} from "../placeholders.ts";
import {
  briefProject,
  loadProject,
  mirrorReferences,
  savePayload,
} from "../project-io.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { RUNNING_WINDOW_MS, loadScenes } from "../scene-helpers.ts";
import { type ToolContext } from "../tool-context.ts";

export async function workshopMakeCreative(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  if (!deps.generateImage) return { error: "יצירת תמונות לא זמינה כאן" };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const { project } = loaded;
  const prompt = (
    String(args.prompt ?? "").trim() ||
    (typeof project.payload.workshop_last_prompt === "string"
      ? project.payload.workshop_last_prompt.trim()
      : "") ||
    [project.title, lookOf(project.payload).bible]
      .filter(Boolean)
      .join(". ")
      .trim()
  ).slice(0, 2000);
  if (!prompt)
    return {
      error: "prompt נדרש: תיאור הוויזואל באנגלית (נושא, סגנון, תאורה)",
    };
  if (project.payload.project_type === "video" && args.formats === undefined) {
    const scenes = await loadScenes(supabase, tenantId, itemId);
    if (scenes.some((scene) => !scene.still_asset_id))
      return {
        error:
          "זה פרויקט סרט עם סצנות שעוד אין להן תמונה. תמונות לסצנות נוצרות עם workshop_make_stills, לא עם workshop_make_creative. אם המשתמש ביקש במפורש תמונת מודעה נפרדת, קראי שוב עם formats.",
      };
  }
  const brief = await briefProject(deps, project.payload, args, {
    kind: "static",
    save: (next) => savePayload(supabase, tenantId, itemId, next),
    needsEngine: true,
  });
  if ("gate" in brief) return brief.gate;
  await mirrorReferences(supabase, tenantId, itemId, args.reference_urls);
  if (
    brief.payload !== project.payload ||
    project.payload.workshop_last_prompt !== prompt
  ) {
    await savePayload(supabase, tenantId, itemId, {
      ...brief.payload,
      workshop_last_prompt: prompt,
    });
    project.payload = { ...brief.payload, workshop_last_prompt: prompt };
  }
  const look = lookOf(project.payload);
  const projectFormats = imageFormatsFrom(
    asRecord(project.payload.workshop).formats,
    imageFormatsFrom([project.payload.format], ["1:1"]),
  );
  const formats = imageFormatsFrom(args.formats, projectFormats).slice(0, 3);
  const estimate = estimateImages(formats);
  const gate = await gatePaid(
    supabase,
    tenantId,
    itemId,
    project.payload,
    {
      tool: "workshop_make_creative",
      engine: brief.engine ?? "auto",
      count: estimate.images,
      usd: estimate.usd,
    },
    args,
    deps,
    {
      formats,
      images: estimate.images,
      estimated_usd: estimate.usd,
      message: `הפקה של ${estimate.images} תמונות (${formats.join(", ")}) תעלה עד כ-$${estimate.usd}. אשר/י והתחל.`,
    },
  );
  if ("stop" in gate) return gate.stop;
  const running = await supabase
    .from("workshop_artifacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("status", "pending")
    .eq("kind", "image")
    .eq("meta->>placeholder", "true")
    .gte("created_at", new Date(Date.now() - RUNNING_WINDOW_MS).toISOString());
  if (Array.isArray(running.data) && running.data.length > 0)
    return {
      success: true,
      already_running: true,
      message:
        "התמונות כבר בהכנה והן מופיעות בלוח לבד. אל תקראי שוב. לעדכון קראי ל-workshop_get_state.",
    };
  project.payload = spendBudget(
    gate.payload,
    "workshop_make_creative",
    formats.length,
  );
  await savePayload(supabase, tenantId, itemId, project.payload);
  const holders = await openPlaceholders(
    supabase,
    tenantId,
    itemId,
    formats.map((format) => ({
      kind: "image" as const,
      title: `${project.title || "תמונה"} · ${format}`,
      meta: { format },
    })),
  );
  const artifacts: Record<string, any>[] = [];
  const generateAll = () =>
    Promise.all(
      formats.map(async (format, index) => {
        try {
          const made = await deps.generateImage!(
            stillPrompt({
              visual: prompt,
              look,
              userReferences: look.references.length,
              hasAnchor: false,
              suffix: "",
            }),
            format,
            look.references,
            brief.engine ?? undefined,
          );
          if (!made.image_url) {
            await settlePlaceholder(
              supabase,
              tenantId,
              holders[index],
              failedPatch(made.error ?? "לא התקבלה תמונה"),
            );
            return { format, ...made };
          }
          const meta = { prompt, format };
          const settled = await settlePlaceholder(
            supabase,
            tenantId,
            holders[index],
            {
              status: "ready",
              url: made.image_url,
              thumb_url: made.image_url,
              meta,
            },
          );
          artifacts.push(
            settled ??
              (await recordArtifact(supabase, {
                tenantId,
                itemId,
                kind: "image",
                title: `${project.title || "תמונה"} · ${format}`,
                url: made.image_url,
                meta,
              })),
          );
          return { format, ...made };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "יצירת התמונה נכשלה";
          await settlePlaceholder(
            supabase,
            tenantId,
            holders[index],
            failedPatch(message),
          );
          return { format, error: message };
        }
      }),
    );
  const generate = async () => {
    const results = await generateAll();
    await refundMissing(
      supabase,
      tenantId,
      itemId,
      "workshop_make_creative",
      results.filter((result) => !result.image_url).length,
    );
    return results;
  };
  if (deps.background && holders.every(Boolean)) {
    deps.background(generate().catch(() => []));
    return {
      success: true,
      started: true,
      pages: formats.length,
      message: `התחלתי ליצור ${formats.length} תמונות. הן מופיעות בלוח בעוד דקה בערך. אם משהו נכשל תופיע למשתמש הודעת שגיאה והעמוד לא נשאר בלוח. אמרי את זה למשתמש במשפט אחד ואל תקראי שוב לכלי.`,
      workshop: { event: "artifacts", item_id: itemId },
    };
  }
  const results = await generate();
  const failed = results.filter((result) => !result.image_url);
  return {
    success: artifacts.length > 0,
    created: artifacts.length,
    failed: failed.map((entry) => ({
      format: entry.format,
      error: entry.error ?? "לא התקבלה תמונה",
    })),
    artifacts,
    workshop: {
      event: "artifacts",
      item_id: itemId,
      artifact_id: artifacts[artifacts.length - 1]?.id,
    },
  };
}
