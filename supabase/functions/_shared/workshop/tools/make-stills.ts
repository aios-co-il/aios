import { spendBudget } from "../budget.ts";
import { estimateImages, imageFormatsFrom } from "../defaults.ts";
import { gatePaid } from "../gate.ts";
import { lookOf, stillPrompt, withLook } from "../look.ts";
import {
  ensureStillPage,
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
import { asRecord } from "../record.ts";
import {
  REDO_KEY,
  RUNNING_WINDOW_MS,
  STILLS_BUDGET_MS,
  STILLS_PER_CALL,
  STILL_CONCURRENCY,
  hasOwnClip,
  loadScenes,
  stringList,
} from "../scene-helpers.ts";
import { type ToolContext } from "../tool-context.ts";
import { quotedProductionEstimate } from "../video-cost.ts";

export async function workshopMakeStills(ctx: ToolContext) {
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
  const scenes = await loadScenes(supabase, tenantId, itemId);
  if (scenes.length === 0)
    return { error: "אין סטוריבורד. קודם workshop_storyboard." };
  const redo = args.redo === true;
  const redoIds = new Set(
    redo
      ? scenes
          // A scene of the user's own video keeps its footage: no picture replaces it.
          .filter((scene) => scene.still_asset_id || !scene.clip_asset_id)
          .map((scene) => String(scene.id))
      : stringList(project.payload[REDO_KEY]),
  );
  const pending = scenes.filter(
    (scene) =>
      (!scene.still_asset_id && !hasOwnClip(scene)) ||
      redoIds.has(String(scene.id)),
  );
  if (pending.length === 0) return { success: true, created: 0, remaining: 0 };
  const running = await supabase
    .from("workshop_artifacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("status", "pending")
    .eq("kind", "scene_still")
    .eq("meta->>placeholder", "true")
    .gte("created_at", new Date(Date.now() - RUNNING_WINDOW_MS).toISOString());
  if (Array.isArray(running.data) && running.data.length > 0)
    return {
      success: true,
      already_running: true,
      message:
        "התמונות לסצנות כבר בהכנה והן מופיעות בלוח לבד. אל תקראי שוב. לעדכון קראי ל-workshop_get_state.",
    };
  const brief = await briefProject(deps, project.payload, args, {
    kind: "video",
    save: (next) => savePayload(supabase, tenantId, itemId, next),
    needsEngine: true,
  });
  if ("gate" in brief) return brief.gate;
  await mirrorReferences(supabase, tenantId, itemId, args.reference_urls);
  if (brief.payload !== project.payload) {
    await savePayload(supabase, tenantId, itemId, brief.payload);
    project.payload = brief.payload;
  }
  const batch = pending.slice(0, STILLS_PER_CALL);
  const format = imageFormatsFrom([project.payload.format], ["9:16"])[0];
  const estimate = estimateImages([format], batch.length);
  const whole = estimateImages([format], pending.length);
  // One budget covers the whole film: the pictures and the production that follows them.
  const filmEngine =
    (deps.defaultEngine ? await deps.defaultEngine() : null) ?? "mock";
  const film = quotedProductionEstimate(
    filmEngine,
    scenes.map((scene) => ({
      duration_s: Number(scene.duration_s) || 3,
      voiceover_text: String(scene.voiceover_text ?? ""),
      lipsync: asRecord(scene.meta).lipsync === true,
      dialogue: String(asRecord(scene.meta).dialogue ?? ""),
    })),
    {
      withVoice: scenes.some((scene) =>
        String(scene.voiceover_text ?? "").trim(),
      ),
      withMusic: true,
    },
    deps.videoConnections ? await deps.videoConnections() : {},
  );
  const projectBudget = Math.max(
    Number(args.budget_usd) || 0,
    (whole.usd + film.totalUsd) * 1.2,
  );
  const gate = await gatePaid(
    supabase,
    tenantId,
    itemId,
    project.payload,
    {
      tool: "workshop_make_stills",
      engine: brief.engine ?? "auto",
      count: pending.length,
      usd: whole.usd,
    },
    { ...args, budget_usd: projectBudget },
    deps,
    {
      scenes: pending.length,
      this_call: batch.length,
      estimated_usd: whole.usd,
      message:
        pending.length > batch.length
          ? `${pending.length} תמונות לסצנות יעלו עד כ-$${whole.usd} (${batch.length} בקריאה הזו, כ-$${estimate.usd}). אשר/י והתחל.`
          : `${batch.length} תמונות לסצנות יעלו עד כ-$${estimate.usd}. אשר/י והתחל.`,
    },
  );
  if ("stop" in gate) return gate.stop;
  let payload = gate.payload;
  if (redo) {
    payload = withLook(payload, {}, { anchorUrl: null }).payload;
    payload = { ...payload, [REDO_KEY]: [...redoIds] };
  }
  if (payload !== project.payload)
    await savePayload(supabase, tenantId, itemId, payload);
  const look = lookOf(payload);
  let anchorUrl = redo ? null : look.anchorUrl;

  const renderStill = async (
    scene: Record<string, any>,
    holder: string | undefined,
  ): Promise<{
    scene: string;
    ok: boolean;
    error?: string;
    url?: string;
  }> => {
    const fail = async (error: string) => {
      await settlePlaceholder(supabase, tenantId, holder, failedPatch(error));
      return { scene: scene.id, ok: false, error };
    };
    try {
      const references = anchorUrl
        ? [...look.references, anchorUrl]
        : look.references;
      const made = await deps.generateImage!(
        stillPrompt({
          visual: scene.visual_prompt,
          look,
          userReferences: look.references.length,
          hasAnchor: Boolean(anchorUrl),
          suffix:
            "Cinematic still frame for a video storyboard. No text on the image.",
        }),
        format,
        references,
        brief.engine ?? undefined,
      );
      if (!made.image_url) return await fail(made.error ?? "לא התקבלה תמונה");
      const attached = await supabase.rpc("attach_video_scene_asset", {
        p_scene_id: scene.id,
        p_kind: "still",
        p_url: made.image_url,
        p_meta: { prompt: scene.visual_prompt, source: "workshop" },
      });
      if (attached.error) return await fail(attached.error.message);
      await ensureStillPage(
        supabase,
        tenantId,
        itemId,
        scene,
        attached.data,
        made.image_url,
        holder,
      );
      return { scene: scene.id, ok: true, url: made.image_url };
    } catch (error) {
      return await fail(
        error instanceof Error ? error.message : "יצירת התמונה נכשלה",
      );
    }
  };

  const renderGroup = async (group: Record<string, any>[]) => {
    const holders = await openPlaceholders(
      supabase,
      tenantId,
      itemId,
      group.map((scene) => ({
        kind: "scene_still" as const,
        title: `סצנה ${scene.position}${scene.title ? ` · ${scene.title}` : ""}`,
        meta: { scene_id: scene.id },
      })),
    );
    return await Promise.all(
      group.map((scene, index) => renderStill(scene, holders[index])),
    );
  };

  const results: { scene: string; ok: boolean; error?: string }[] = [];
  const startedAt = Date.now();
  let todo = [...batch];
  if (!anchorUrl) {
    const first = todo.shift()!;
    const [done] = await renderGroup([first]);
    results.push({ scene: done.scene, ok: done.ok, error: done.error });
    if (!done.ok) todo = [];
    else {
      anchorUrl = done.url ?? null;
      payload = withLook(payload, {}, { anchorUrl }).payload;
      await savePayload(supabase, tenantId, itemId, payload);
    }
  }
  for (let i = 0; i < todo.length; i += STILL_CONCURRENCY) {
    if (i > 0 && Date.now() - startedAt > STILLS_BUDGET_MS) break;
    const chunk = todo.slice(i, i + STILL_CONCURRENCY);
    results.push(...(await renderGroup(chunk)));
  }
  const created = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  const remaining = pending.length - created;
  const redone = new Set(
    results.filter((result) => result.ok).map((result) => result.scene),
  );
  const leftToRedo = stringList(payload[REDO_KEY]).filter(
    (id) => !redone.has(id),
  );
  const settled = spendBudget(
    { ...payload, [REDO_KEY]: leftToRedo },
    "workshop_make_stills",
    created,
  );
  if (leftToRedo.length === 0) delete settled[REDO_KEY];
  await savePayload(supabase, tenantId, itemId, settled);
  return {
    success: created > 0,
    created,
    failed,
    remaining,
    used_references: look.references.length,
    anchored: Boolean(anchorUrl),
    message:
      created === 0
        ? `לא נוצרה אף תמונה. ${failed[0]?.error ?? ""}`.trim()
        : `${created} תמונות נוצרו והן כבר מופיעות בלוח, אין צורך לשלוח או לצרף אותן. ${
            look.references.length > 0
              ? `נוצרו לפי ${look.references.length} רפרנסים ותמונת עוגן אחת לאחידות. `
              : "אין לפרויקט רפרנס: אם המשתמש צירף או הזכיר תמונה, העבירי אותה ב-reference_urls והציעי ליצור מחדש עם redo=true. "
          }${
            remaining > 0
              ? `נשארו ${remaining} סצנות בלי תמונה: קראי שוב ל-workshop_make_stills להמשך, בלי redo. כל עוד זה בתקציב זה ירוץ בלי לשאול.`
              : "לכל הסצנות יש תמונה: הציעי להמשיך להפקת הסרט."
          }`,
    workshop: { event: "artifacts", item_id: itemId },
  };
}
