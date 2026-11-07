import { spendBudget } from "../budget.ts";
import { imageFormatsFrom } from "../defaults.ts";
import { lookOf, withLook } from "../look.ts";
import {
  briefProject,
  loadProject,
  mirrorReferences,
  savePayload,
} from "../project-io.ts";
import {
  REDO_KEY,
  STILLS_PER_CALL,
  loadScenes,
  stringList,
} from "../scene-helpers.ts";
import { type ToolContext } from "../tool-context.ts";
import { renderBatch } from "./make-stills-batch.ts";
import { gateStills } from "./make-stills-gate.ts";
import { stillsMessage } from "./make-stills-message.ts";
import { ownReference, type StillJob } from "./make-stills-render.ts";
import { pendingStills, stillsRunning } from "./make-stills-scenes.ts";
import { allStillsMade } from "./stills-approval.ts";

/**
 * Makes the storyboard's scene pictures, a batch per call within the project budget: the anchor
 * frame first, then the rest from it. The last picture asks for approval in semi-automatic mode.
 */
export async function workshopMakeStills(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  const generateImage = deps.generateImage;
  if (!generateImage) {
    return { error: "יצירת תמונות לא זמינה כאן" };
  }
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
  const { redoIds, pending } = pendingStills(scenes, project.payload, redo);
  if (pending.length === 0) return { success: true, created: 0, remaining: 0 };
  if (await stillsRunning(supabase, tenantId, itemId)) {
    return ALREADY_RUNNING;
  }
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
  const gate = await gateStills(ctx, {
    itemId,
    payload: project.payload,
    scenes,
    pending,
    batch,
    format,
    engine: brief.engine,
  });
  if ("stop" in gate) return gate.stop;
  let payload = gate.payload;
  if (redo) {
    payload = withLook(payload, {}, { anchorUrl: null }).payload;
    payload = { ...payload, [REDO_KEY]: [...redoIds] };
  }
  if (payload !== project.payload)
    await savePayload(supabase, tenantId, itemId, payload);
  const look = lookOf(payload);
  const job: StillJob = {
    ctx,
    itemId,
    generateImage,
    look,
    format,
    engine: brief.engine,
    anchorUrl: redo ? null : look.anchorUrl,
  };
  const results = await renderBatch(job, batch, async (anchorUrl) => {
    payload = withLook(payload, {}, { anchorUrl }).payload;
    await savePayload(supabase, tenantId, itemId, payload);
  });
  const created = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  const remaining = pending.length - created;
  const redone = new Set(
    results.filter((result) => result.ok).map((result) => result.scene),
  );
  const ownMade = batch.filter(
    (scene) => redone.has(scene.id) && ownReference(scene),
  ).length;
  const leftToRedo = stringList(payload[REDO_KEY]).filter(
    (id) => !redone.has(id),
  );
  const settled = spendBudget(
    { ...payload, [REDO_KEY]: leftToRedo },
    "workshop_make_stills",
    created,
  );
  if (leftToRedo.length === 0) delete settled[REDO_KEY];
  // The last picture: semi-automatic mode asks the user to approve them (stills-approval.ts).
  const done =
    remaining === 0 ? await allStillsMade(ctx, itemId, settled) : null;
  await savePayload(supabase, tenantId, itemId, done?.payload ?? settled);
  return {
    success: created > 0,
    created,
    failed,
    remaining,
    used_references: look.references.length,
    ...(ownMade > 0 ? { own_reference_scenes: ownMade } : {}),
    anchored: Boolean(job.anchorUrl),
    message: stillsMessage({
      created,
      failed,
      ownMade,
      references: look.references.length,
      remaining,
      note: done?.note,
    }),
    ...done?.ask,
    workshop: { event: "artifacts", item_id: itemId },
  };
}

/** An earlier call is still making the pictures: Carmen waits for them on the board. */
const ALREADY_RUNNING = {
  success: true,
  already_running: true,
  message:
    "התמונות לסצנות כבר בהכנה והן מופיעות בלוח לבד. אל תקראי שוב. לעדכון קראי ל-workshop_get_state.",
};
