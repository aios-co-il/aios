import { ASSET_BUCKET, type AssetView, isHttpUrl } from "./assets.ts";
import {
  answersFromArgs,
  answersFromMessage,
  briefAnswersOf,
  briefAsked,
  filmFromAnswers,
  unanswered,
  withBriefAnswers,
  withBriefAsked,
} from "./brief-answers.ts";
import { FILM_CHOICES, STYLE_CHOICES } from "./briefing-choices.ts";
import { briefingGate } from "./briefing.ts";
import { PROVIDER_LABEL } from "./capabilities.ts";
import { type Db } from "./db.ts";
import { type WorkshopDeps } from "./gate.ts";
import { type ImageProvider, normalizeEngine } from "./image-providers.ts";
import { lookOf, withLook } from "./look.ts";
import { asRecord, recordArtifact } from "./record.ts";

export function voiceHelpers(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
  deps: WorkshopDeps,
) {
  return {
    voiceSample: deps.voiceSample,
    userText: deps.userText ?? null,
    addSamplePage: async (title: string, path: string, voiceId: string) => {
      // One sample page per voice in a project, however often the menu is shown.
      const { data: existing } = await supabase
        .from("workshop_artifacts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("item_id", itemId)
        .eq("kind", "narration")
        .eq("meta->>voice_id", voiceId)
        .eq("meta->>sample", "true")
        .limit(1)
        .maybeSingle();
      if (existing) return;
      await recordArtifact(supabase, {
        tenantId,
        itemId,
        kind: "narration",
        folder: "voices",
        title,
        url: path,
        meta: { voice_id: voiceId, sample: true },
      });
    },
    saveVoice: (voiceId: string, voiceName: string) =>
      savePayload(
        supabase,
        tenantId,
        itemId,
        withBriefAnswers(
          {
            ...payload,
            video: { ...asRecord(payload.video), voice_id: voiceId },
          },
          { "קול קריינות": voiceName },
        ),
      ),
  };
}

export async function savePayload(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
) {
  // asset_references belongs to the assets trigger: keep what the database holds right now, so a
  // save from an older copy of the project never wipes the pictures the user just marked.
  const current = await supabase
    .from("marketing_work_items")
    .select("payload")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const held = asRecord(current?.data?.payload).asset_references;
  const next = { ...payload };
  if (Array.isArray(held)) next.asset_references = held;
  else delete next.asset_references;
  const { error } = await supabase
    .from("marketing_work_items")
    .update({ payload: next })
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

/**
 * The briefing before any picture work: the user's style and (when several are connected) engine.
 * Returns a gate with the questions to ask, or the payload with the look folded in.
 */
export async function briefProject(
  deps: WorkshopDeps,
  payload: Record<string, unknown>,
  args: Record<string, unknown>,
  options: {
    kind: "video" | "static";
    needsEngine: boolean;
    needsStyle?: boolean;
    /** Keeps new answers on the project even when the tool stops to ask more. */
    save?: (payload: Record<string, unknown>) => Promise<void>;
  },
): Promise<
  | { gate: Record<string, unknown> }
  | { payload: Record<string, unknown>; engine: ImageProvider | null }
> {
  const stored = lookOf(payload);
  const connected = deps.imageEngines ? await deps.imageEngines() : null;
  const rawEngine =
    typeof args.engine === "string" && args.engine.trim() ? args.engine : null;
  const asked = rawEngine ? normalizeEngine(rawEngine) : null;
  if (rawEngine && !asked)
    return {
      gate: {
        error: `לא מכירה את המנוע "${rawEngine}". האפשרויות: google, elevenlabs, higgsfield, openai.`,
      },
    };
  if (asked && connected && !connected.includes(asked))
    return {
      gate: {
        error: `אין מפתח ל-${PROVIDER_LABEL[asked]} בהגדרות מודלי AI. המחוברים: ${connected.join(", ") || "אין"}.`,
      },
    };
  const chosen = (asked ??
    (stored.engine && connected?.includes(stored.engine as ImageProvider)
      ? stored.engine
      : null)) as ImageProvider | null;
  // The user's answers (taps or brief_answers) go into the project brief right away.
  const questions =
    options.kind === "video"
      ? [...STYLE_CHOICES.video, ...FILM_CHOICES]
      : STYLE_CHOICES.static;
  const fresh = {
    ...answersFromMessage(
      deps.userText ?? "",
      unanswered(questions, briefAnswersOf(payload)),
    ),
    ...answersFromArgs(args.brief_answers),
  };
  const briefed = withBriefAnswers(payload, fresh);
  const answers = briefAnswersOf(briefed);
  const writtenFilm =
    options.kind === "video" && !stored.film ? filmFromAnswers(answers) : null;
  const folded = withLook(briefed, {
    ...args,
    engine: asked,
    ...(writtenFilm && !args.film_brief ? { film_brief: writtenFilm } : {}),
  });
  const look = lookOf(folded.payload);
  const gate = briefingGate({
    look,
    styleApproved: args.style_approved === true || stored.bible.length > 0,
    connected,
    engine: chosen,
    kind: options.kind,
    needsEngine: options.needsEngine,
    needsStyle: options.needsStyle,
    answers,
    asked: briefAsked(payload),
  });
  if (gate) {
    // Shown to the user now: from the next turn Carmen may fill in what they leave open.
    const asking = typeof gate.say_to_user === "string" && gate.say_to_user;
    if (
      options.save &&
      (Object.keys(fresh).length > 0 || writtenFilm || asking)
    ) {
      const kept = withLook(
        briefed,
        writtenFilm ? { film_brief: writtenFilm } : {},
      ).payload;
      await options.save(asking ? withBriefAsked(kept) : kept);
    }
    return { gate: gate as unknown as Record<string, unknown> };
  }
  return {
    payload: folded.payload,
    engine: chosen ?? (connected?.length === 1 ? connected[0] : null),
  };
}

export async function loadProject(
  supabase: Db,
  tenantId: string,
  itemId: string,
  assertClientAccess: (clientId: string) => Promise<void>,
) {
  const loaded = await supabase
    .from("marketing_work_items")
    .select("id, title, client_id, current_stage_id, payload")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loaded.error) return { error: loaded.error.message };
  if (!loaded.data) return { error: "פרויקט לא נמצא" };
  if (loaded.data.client_id) {
    try {
      await assertClientAccess(loaded.data.client_id);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
      };
    }
  }
  return {
    project: {
      id: loaded.data.id as string,
      title: (loaded.data.title as string | null) ?? "",
      client_id: (loaded.data.client_id as string | null) ?? null,
      stage_id: (loaded.data.current_stage_id as string | null) ?? null,
      payload: asRecord(loaded.data.payload),
    },
  };
}

export const publicUrlOf = (supabase: Db) => (path: string) =>
  supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data
    .publicUrl as string;

export const ASSET_COLUMNS =
  "id, asset_type, source, title, url, storage_path, text, use_as_reference, meta, created_at";

export async function loadAssets(
  supabase: Db,
  tenantId: string,
  itemId: string,
): Promise<AssetView[]> {
  const { data } = await supabase
    .from("workshop_assets")
    .select(ASSET_COLUMNS)
    .eq("item_id", itemId)
    .eq("tenant_id", tenantId)
    .order("created_at");
  return Array.isArray(data) ? (data as AssetView[]) : [];
}

/** Pictures passed to a tool as references also show in the assets tab, so the user sees what Carmen follows. */
export async function mirrorReferences(
  supabase: Db,
  tenantId: string,
  itemId: string,
  urls: unknown,
) {
  const wanted = (Array.isArray(urls) ? urls : [])
    .filter(isHttpUrl)
    .slice(0, 4);
  if (wanted.length === 0) return;
  const known = new Set(
    (await loadAssets(supabase, tenantId, itemId)).map((a) => a.url),
  );
  const rows = wanted
    .filter((url) => !known.has(url))
    .map((url) => ({
      tenant_id: tenantId,
      item_id: itemId,
      asset_type: "image",
      source: "user",
      title: "רפרנס",
      url,
      use_as_reference: true,
      meta: { from: "reference_urls" },
    }));
  if (rows.length > 0) await supabase.from("workshop_assets").insert(rows);
}
