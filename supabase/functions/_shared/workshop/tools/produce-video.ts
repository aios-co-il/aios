import { spendBudget } from "../budget.ts";
import { imageFormatsFrom } from "../defaults.ts";
import { gatePaid, refundMissing } from "../gate.ts";
import { productionRunning } from "../production.ts";
import { loadProject, savePayload, voiceHelpers } from "../project-io.ts";
import { asRecord, creativeStageFor, recordArtifact } from "../record.ts";
import {
  PAGE_COLUMNS,
  endingOf,
  hasOwnClip,
  loadScenes,
  previewClipIds,
} from "../scene-helpers.ts";
import { type ToolContext } from "../tool-context.ts";
import { clipSaysLine, talkingLine } from "../talking.ts";
import {
  ENGINE_LABEL,
  type SceneEngine,
  costSceneOf,
  isSceneEngine,
  quotedProductionEstimate,
} from "../video-cost.ts";
import { musicPromptFor, wantsSoundDesign } from "../sound-design.ts";
import { chooseVoice } from "../voice-tool.ts";
import { narrationVoiceId } from "../voices.ts";

type Scene = Record<string, unknown>;

/**
 * Of the scenes kept as they are, the talking ones the production lip-syncs again: a still to
 * lip-sync and a clip that does not say the current line (advance_video_production's rule).
 */
async function relipScenes(
  supabase: ToolContext["supabase"],
  tenantId: string,
  kept: Scene[],
): Promise<Scene[]> {
  const talking = kept.filter(
    (scene) =>
      scene.still_asset_id && talkingLine(scene.meta, scene.voiceover_text),
  );
  const ids = talking
    .map((scene) => String(scene.clip_asset_id ?? ""))
    .filter(Boolean);
  if (ids.length === 0) return talking;
  const { data } = await supabase
    .from("marketing_assets")
    .select("id, meta")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  const clips = new Map(
    (Array.isArray(data) ? data : []).map((row: Scene) => [
      String(row.id),
      row.meta,
    ]),
  );
  return talking.filter(
    (scene) =>
      !clipSaysLine(
        clips.get(String(scene.clip_asset_id ?? "")),
        talkingLine(scene.meta, scene.voiceover_text),
      ),
  );
}

/**
 * What produce_video makes for the whole film besides the clips: a narration when the current one
 * does not read the script in the film's voice (video_narration_ready; a new voice narrates
 * again), and a music bed when the film has none. A check that cannot be read counts as due, so
 * the quote never leaves them out.
 */
async function soundDue(
  supabase: ToolContext["supabase"],
  tenantId: string,
  itemId: string,
  newVoice: boolean,
) {
  try {
    const ready = newVoice
      ? null
      : await supabase.rpc("video_narration_ready", { p_item_id: itemId });
    const { data } = await supabase
      .from("marketing_assets")
      .select("id, type, url")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("type", "music")
      .limit(5);
    const bed = (Array.isArray(data) ? data : []).some(
      (row: Scene) => row.type === "music" && String(row.url ?? "") !== "",
    );
    return { narration: ready?.data !== true, music: !bed };
  } catch {
    return { narration: true, music: true };
  }
}

export async function workshopProduceVideo(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
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
  const noStill = scenes.filter(
    (scene) => !scene.still_asset_id && !hasOwnClip(scene),
  ).length;
  if (noStill > 0)
    return {
      error: `לא לכל הסצנות יש תמונה (${noStill} חסרות). קודם workshop_make_stills.`,
      missing_stills: noStill,
    };

  const video = asRecord(project.payload.video);
  const pendingFilm = () =>
    supabase
      .from("workshop_artifacts")
      .select(PAGE_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("kind", "film")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  const runningReply = (
    provider: unknown,
    client: unknown,
    artifact: unknown,
  ) => ({
    success: true,
    status: "running",
    already_running: true,
    engine: isSceneEngine(provider) ? ENGINE_LABEL[provider] : undefined,
    client_id: client,
    user_message: "הסרט כבר בהפקה, והוא יופיע בלוח כשיהיה מוכן.",
    message:
      "הפקה כבר רצה לפרויקט הזה ולא הותחלה שנייה. לבדוק את המצב: workshop_get_state (production), ולא להפיק שוב.",
    ...(artifact ? { artifact } : {}),
  });
  // produce_video queues nothing while a production runs: no quote, no second charge.
  const production = asRecord(video.production);
  if (productionRunning(production))
    return runningReply(
      production.provider,
      project.client_id,
      (await pendingFilm())?.data,
    );

  let stageId = project.stage_id;
  let clientId = project.client_id;
  if (!stageId) {
    const wanted = String(args.client_id ?? "").trim() || clientId || null;
    try {
      if (wanted && wanted !== project.client_id)
        await assertClientAccess(wanted);
      const stage = await creativeStageFor(supabase, tenantId, wanted);
      const linked = await supabase
        .from("marketing_work_items")
        .update({
          ...(wanted ? { client_id: wanted } : {}),
          pipeline_id: stage.pipelineId,
          current_stage_id: stage.stageId,
        })
        .eq("id", itemId)
        .eq("tenant_id", tenantId);
      if (linked.error) return { error: linked.error.message };
      stageId = stage.stageId;
      clientId = wanted;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "שיוך הלקוח נכשל",
      };
    }
  }

  let engine: SceneEngine | null = isSceneEngine(args.engine)
    ? args.engine
    : isSceneEngine(video.scene_engine) && video.scene_engine !== "mock"
      ? video.scene_engine
      : null;
  // A remembered ElevenLabs choice is re-checked: Starter cannot animate or narrate,
  // and defaultEngine then returns Higgsfield or the free preview.
  if (!engine || engine === "elevenlabs") {
    const resolved = deps.defaultEngine ? await deps.defaultEngine() : null;
    if (resolved) engine = resolved;
  }
  if (!engine) engine = "mock";
  // The scenes produce_video queues a clip for: none yet, stale, failed, or (on a paid
  // engine) made by the free preview.
  const previewClips =
    engine === "mock"
      ? new Set<string>()
      : await previewClipIds(
          supabase,
          tenantId,
          itemId,
          scenes.map((scene) => scene.clip_asset_id).filter(Boolean),
        );
  const animated = scenes.filter(
    (scene) =>
      !scene.clip_asset_id ||
      scene.clip_stale === true ||
      scene.status === "failed" ||
      previewClips.has(String(scene.clip_asset_id)),
  );
  const costScenes = animated.map(costSceneOf);
  // A kept clip that does not say the scene's current line (a line changed on the board) is
  // lip-synced again by the production (queue_video_lipsync), so the quote prices that too.
  const relip = (
    await relipScenes(
      supabase,
      tenantId,
      scenes.filter((scene) => !animated.includes(scene)),
    )
  ).map(costSceneOf);
  const withVoice = scenes.some((scene) =>
    String(scene.voiceover_text ?? "").trim(),
  );
  // A talking scene's own line is recorded in the project's voice too (queue_video_lipsync
  // reads video.voice_id), so it also needs a voice the user chose.
  const talking = scenes.some((scene) =>
    talkingLine(scene.meta, scene.voiceover_text),
  );
  const withMusic = args.music !== false;
  // Trailer sound design (a transition sound at each cut, a soft hit on title and end card) and
  // the music bed both follow the film brief; the render worker reads video.sound_design and
  // makes the effects in this production's render only, so the quote includes them.
  const soundDesign = wantsSoundDesign(project.payload, {
    choice: args.sound_design,
    userText: deps.userText,
  });
  // The narration is checked against this voice; a new one re-narrates the film.
  const voiceId = narrationVoiceId(args.voice_id, video.voice_id);
  // Narration and music are made for the whole film, also when no scene is animated (a film cut
  // from the user's own videos, or one line changed).
  const due = await soundDue(
    supabase,
    tenantId,
    itemId,
    voiceId !== narrationVoiceId(undefined, video.voice_id),
  );
  const estimate = quotedProductionEstimate(
    engine,
    costScenes,
    {
      withVoice: withVoice && due.narration,
      withMusic: withMusic && due.music,
      withSoundEffects: soundDesign,
      film: scenes.map(costSceneOf),
    },
    deps.videoConnections ? await deps.videoConnections() : {},
    relip,
  );
  // Narration needs a voice the user chose after hearing it.
  if ((withVoice || talking) && !voiceId)
    return await chooseVoice(
      {},
      voiceHelpers(supabase, tenantId, itemId, project.payload, deps),
    );
  const gate = await gatePaid(
    supabase,
    tenantId,
    itemId,
    project.payload,
    {
      tool: "workshop_produce_video",
      engine,
      count: costScenes.length + relip.length,
      usd: estimate.totalUsd,
    },
    args,
    deps,
    {
      engine,
      engine_label: ENGINE_LABEL[engine],
      scenes: scenes.length,
      clip_seconds: estimate.clipSeconds,
      with_voice: withVoice,
      with_music: withMusic,
      // Talking scenes and what their voice lines and lip sync add to the price.
      ...(estimate.talkingScenes > 0
        ? {
            talking_scenes: estimate.talkingScenes,
            lipsync_usd: estimate.lipsync.usd,
          }
        : {}),
      ...(soundDesign
        ? {
            with_sound_effects: true,
            sound_effects_usd: estimate.soundEffects.usd,
          }
        : {}),
      estimated_usd: estimate.totalUsd,
      message:
        engine === "mock"
          ? estimate.totalUsd > 0
            ? `הסצנות יונפשו במנוע התצוגה החינמי (תנועה פשוטה על התמונות); הקריינות והסאונד יעלו עד כ-$${estimate.totalUsd}. אשר/י והתחל.`
            : "הסרט יופק במנוע התצוגה החינמי (תנועה פשוטה על התמונות), בלי עלות. אשר/י והתחל."
          : `ההפקה במנוע ${ENGINE_LABEL[engine]} תעלה עד כ-$${estimate.totalUsd}. אשר/י והתחל.`,
    },
  );
  if ("stop" in gate) return gate.stop;

  const format = imageFormatsFrom([project.payload.format], ["9:16"])[0];
  const ctaText =
    typeof args.cta_text === "string"
      ? args.cta_text.replace(/\s+/g, " ").trim().slice(0, 120)
      : "";
  const musicPrompt = musicPromptFor(gate.payload, deps.userText ?? "");
  // The quote is charged before the RPC (the payload's video settings must be saved first); a
  // production that never started gives it back.
  const units = costScenes.length + relip.length || 1;
  const refund = () =>
    refundMissing(supabase, tenantId, itemId, "workshop_produce_video", units);
  try {
    await savePayload(
      supabase,
      tenantId,
      itemId,
      spendBudget(
        {
          ...endingOf(gate.payload, ctaText),
          video: {
            ...video,
            scene_engine: engine,
            sound_engine: "elevenlabs",
            sound_design: soundDesign,
            // The narration is checked against this voice; a new one re-narrates the film.
            ...(voiceId ? { voice_id: voiceId } : {}),
          },
        },
        "workshop_produce_video",
        units,
      ),
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "שמירת הפרויקט נכשלה",
    };
  }
  const produced = await supabase.rpc("produce_video", {
    p_item_id: itemId,
    p_aspect: format,
    p_provider: engine,
    // Free-preview clips are priced in costScenes, so the paid engine may redo them.
    p_redo_preview: true,
    p_estimate: {
      clips: estimate.clips,
      voice: estimate.voice,
      music: estimate.music,
      lipsync: estimate.lipsync,
      sound_effects: estimate.soundEffects,
    },
    p_stage_id: stageId,
    p_with_voice: withVoice,
    p_with_music: withMusic,
    p_voice_id: voiceId,
    p_music_prompt: musicPrompt,
    p_generate_audio: false,
  });
  if (produced.error) {
    await refund();
    return {
      error: [
        produced.error.message,
        produced.error.details,
        produced.error.code,
      ]
        .filter(Boolean)
        .join(" | "),
    };
  }
  const state = asRecord(produced.data);
  // A production that failed at once queued nothing paid, and gets no pending film page (it
  // would spin forever).
  if (state.status === "failed") {
    await refund();
    return {
      success: false,
      status: "failed",
      error: String(state.error ?? "ההפקה נכשלה"),
    };
  }
  // produce_video's lock: another production runs, and this call queued nothing.
  const alreadyRunning =
    state.status === "running" &&
    Number(state.clips ?? 0) + Number(state.voices ?? 0) === 0 &&
    Number(state.music ?? 0) === 0;
  if (alreadyRunning) await refund();
  const open = alreadyRunning ? await pendingFilm() : null;
  if (alreadyRunning && open?.data)
    return runningReply(engine, clientId, open.data);
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "film",
    title: project.title ? `${project.title} · סרט` : "הסרט",
    status: "pending",
    meta: { engine, estimated_usd: estimate.totalUsd },
  });
  return {
    success: true,
    started: true,
    user_message: "ההפקה התחילה ורצה ברקע. הסרט יופיע בלוח כשיהיה מוכן.",
    status: state.status ?? "running",
    engine: ENGINE_LABEL[engine],
    client_id: clientId,
    ...(soundDesign ? { sound_design: true } : {}),
    message:
      "ההפקה התחילה ורצה ברקע בשרת ההפקה. הסרט יופיע בלוח כשיהיה מוכן. אל תפיקי שוב: לבדיקה קראי ל-workshop_get_state ובדקי production.",
    artifact,
    workshop: {
      event: "artifacts",
      item_id: itemId,
      artifact_id: artifact.id,
    },
  };
}
