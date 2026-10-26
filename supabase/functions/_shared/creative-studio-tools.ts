/**
 * Carmen tools for the Creative studio chat. Plain TypeScript, no Deno APIs.
 *
 * Two kinds of tools:
 * - Data tools change the project directly (settings, brand assets, scene text). The studio
 *   follows marketing_work_items and marketing_video_scenes, so the change shows up live.
 * - studio_ui_action asks the open studio to run one of its own buttons (generate, produce,
 *   animate, approve, focus). The studio runs it through the same handler and the same cost
 *   confirmation as a click, so chat and buttons can never drift apart and nothing paid
 *   runs without the user's approval on screen.
 *
 * Every call loads the project inside the caller's tenant first and checks client access;
 * the agent runs with the service role, so RLS does not apply here.
 */

const FORMATS = ["1:1", "4:5", "9:16", "16:9"] as const;
const STILL_MODELS = ["gpt-image-1", "nano-banana-pro"] as const;
const SCENE_ENGINES = [
  "mock",
  "kling",
  "elevenlabs",
  "higgsfield",
  "openrouter",
] as const;
const SOUND_ENGINES = ["elevenlabs", "higgsfield"] as const;
const ATTACH_ROLES = [
  "logo",
  "style_reference",
  "brand_book",
  "character",
] as const;
const UI_ACTIONS = [
  "produce_video",
  "generate_variations",
  "single_variation",
  "revise_variation",
  "regenerate_frame",
  "animate_scene",
  "approve_to_campaigns",
  "focus_scene",
  "focus_variation",
  "open_drawer",
] as const;
const DRAWERS = ["projects", "project", "scene", "edit", "versions"] as const;

type UiAction = (typeof UI_ACTIONS)[number];

const itemIdParam = {
  item_id: {
    type: "string",
    description: "מזהה פרויקט הקריאייטיב (מגיע בהקשר הסטודיו)",
  },
};

export const CREATIVE_STUDIO_TOOLS = [
  {
    name: "get_studio_state",
    description:
      "מצב הסטודיו של פרויקט קריאייטיב: סוג (סרטון/סטטי), פורמט, מותג (לוגו, רפרנסים, דמות), הגדרות מנועים, סצנות או וריאציות, מצב הפקה, ומה חסר כדי להתחיל.",
    parameters: {
      type: "object",
      properties: itemIdParam,
      required: ["item_id"],
    },
  },
  {
    name: "update_studio_settings",
    description:
      "משנה הגדרות של פרויקט קריאייטיב: פורמט, סגנון ויזואלי, מודל לפריימים, מנוע הנפשה, מנוע סאונד, קול קריינות. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        ...itemIdParam,
        format: { type: "string", enum: [...FORMATS] },
        visual_style: { type: "string", description: "מזהה סגנון ויזואלי" },
        still_model: { type: "string", enum: [...STILL_MODELS] },
        scene_engine: { type: "string", enum: [...SCENE_ENGINES] },
        sound_engine: { type: "string", enum: [...SOUND_ENGINES] },
        voice_id: { type: "string", description: "ElevenLabs voice id" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "attach_to_project",
    description:
      "מצרף קובץ שהמשתמש העלה בצ׳אט לפרויקט: לוגו, רפרנס סגנון, ספר מותג, או תמונת הדמות הקבועה לסרטון. מקבל את הקישור מהודעת הצ׳אט.",
    parameters: {
      type: "object",
      properties: {
        ...itemIdParam,
        file_url: { type: "string" },
        file_name: { type: "string" },
        role: { type: "string", enum: [...ATTACH_ROLES] },
      },
      required: ["item_id", "file_url", "role"],
    },
  },
  {
    name: "edit_scene",
    description:
      "עורך סצנה בסטוריבורד לפי מספר הסצנה (1 = הראשונה): מה רואים, מה זז, טקסט על המסך, קריינות, משך, שם. לא עולה כסף; כדי לראות שינוי בתמונה צריך פריים חדש או הנפשה מחדש.",
    parameters: {
      type: "object",
      properties: {
        ...itemIdParam,
        scene_number: { type: "number" },
        title: { type: "string" },
        visual_prompt: { type: "string" },
        motion_prompt: { type: "string" },
        overlay_text: { type: "string" },
        voiceover_text: { type: "string" },
        duration_s: { type: "number" },
      },
      required: ["item_id", "scene_number"],
    },
  },
  {
    name: "add_scene",
    description:
      "מוסיף סצנה לסטוריבורד, אחרי סצנה מסוימת או בסוף. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        ...itemIdParam,
        after_scene_number: {
          type: "number",
          description: "0 = בהתחלה; ריק = בסוף",
        },
        title: { type: "string" },
        visual_prompt: { type: "string" },
        motion_prompt: { type: "string" },
        overlay_text: { type: "string" },
        voiceover_text: { type: "string" },
        duration_s: { type: "number" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "delete_scene",
    description:
      "מוחק סצנה מהסטוריבורד. מבקשים אישור מהמשתמש קודם ושולחים confirmed=true רק אחריו.",
    parameters: {
      type: "object",
      properties: {
        ...itemIdParam,
        scene_number: { type: "number" },
        confirmed: { type: "boolean" },
      },
      required: ["item_id", "scene_number"],
    },
  },
  {
    name: "studio_ui_action",
    description:
      "מפעיל בסטודיו הפתוח את אותו כפתור שהמשתמש היה לוחץ: produce_video (הפק/עדכן סרט), generate_variations (וריאציות לכל הקונספטים), single_variation, revise_variation (תיקון וריאציה לפי הערה), regenerate_frame (פריים חדש לסצנה), animate_scene, approve_to_campaigns, focus_scene, focus_variation, open_drawer. פעולות בתשלום פותחות על המסך חלון עלות לאישור — לא צריך לשאול לפני כן, רק להגיד שזה נפתח.",
    parameters: {
      type: "object",
      properties: {
        ...itemIdParam,
        action: { type: "string", enum: [...UI_ACTIONS] },
        scene_number: { type: "number" },
        variation_id: { type: "string" },
        note: {
          type: "string",
          description: "הנחיה לתיקון (revise_variation / regenerate_frame)",
        },
        text_as_layers: {
          type: "boolean",
          description: "וריאציות סטטיות: טקסט כשכבות עריכות במקום על התמונה",
        },
        mixed_structure: {
          type: "boolean",
          description: "generate_variations: מבנה שונה לכל קונספט",
        },
        drawer: { type: "string", enum: [...DRAWERS] },
      },
      required: ["item_id", "action"],
    },
  },
];

export const isCreativeStudioTool = (name: string) =>
  CREATIVE_STUDIO_TOOLS.some((tool) => tool.name === name);

type QueryResult = { data: unknown; error: { message: string } | null };

type Query = PromiseLike<QueryResult> & {
  select: (columns: string) => Query;
  eq: (column: string, value: unknown) => Query;
  order: (column: string) => Query;
  update: (values: Record<string, unknown>) => Query;
  insert: (values: Record<string, unknown>) => Query;
  delete: () => Query;
  single: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
};

type Db = { from: (table: string) => Query };

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const pick = <T extends readonly string[]>(list: T, value: unknown) =>
  typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;

const text = (value: unknown, max = 4000) =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;

const isHttpUrl = (value: unknown) =>
  typeof value === "string" && /^https:\/\/[^\s]+$/i.test(value);

interface Project {
  id: string;
  title: string | null;
  client_id: string | null;
  current_stage_id: string | null;
  payload: Record<string, unknown>;
}

const SCENE_COLUMNS =
  "id, position, title, status, duration_s, visual_prompt, motion_prompt, overlay_text, voiceover_text, still_asset_id, clip_asset_id, voice_asset_id, clip_stale";

async function loadScenes(supabase: Db, tenantId: string, itemId: string) {
  const { data, error } = await supabase
    .from("marketing_video_scenes")
    .select(SCENE_COLUMNS)
    .eq("item_id", itemId)
    .eq("tenant_id", tenantId)
    .order("position");
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as Record<string, unknown>[];
}

const sceneAt = (scenes: Record<string, unknown>[], number: unknown) => {
  const index = Math.round(Number(number)) - 1;
  return Number.isInteger(index) && index >= 0 && index < scenes.length
    ? scenes[index]
    : null;
};

async function savePayload(
  supabase: Db,
  tenantId: string,
  project: Project,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("marketing_work_items")
    .update({ payload })
    .eq("id", project.id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

const isVideo = (payload: Record<string, unknown>) =>
  payload.project_type === "video";

/** What is missing before the first generation, in the user's words. */
export function missingForStudio(
  payload: Record<string, unknown>,
  counts: { scenes: number; copy: number },
) {
  const missing: string[] = [];
  if (!payload.logo_url) missing.push("לוגו");
  const refs = Array.isArray(payload.style_references)
    ? payload.style_references
    : [];
  if (refs.length === 0) missing.push("רפרנס סגנון (תמונה או מודעה קודמת)");
  if (isVideo(payload)) {
    if (counts.scenes === 0) missing.push("סצנות לסטוריבורד");
  } else if (counts.copy === 0 && !text(payload.brief_text)) {
    missing.push("קופי או בריף");
  }
  return missing;
}

export async function executeCreativeStudioTool(
  supabase: Db,
  tenantId: string,
  name: string,
  args: Record<string, unknown>,
  assertClientAccess: (clientId: string) => Promise<void> = async () => {},
) {
  if (!isCreativeStudioTool(name)) return { error: "כלי לא מוכר" };
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };

  const loaded = await supabase
    .from("marketing_work_items")
    .select("id, title, client_id, current_stage_id, payload")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loaded.error) return { error: loaded.error.message };
  if (!loaded.data) return { error: "פרויקט לא נמצא" };
  const project = {
    ...(loaded.data as Project),
    payload: asRecord((loaded.data as Project).payload),
  };
  if (project.client_id) {
    try {
      await assertClientAccess(project.client_id);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
      };
    }
  }
  const payload = project.payload;
  const video = asRecord(payload.video);

  if (name === "get_studio_state") {
    const scenes = isVideo(payload)
      ? await loadScenes(supabase, tenantId, itemId)
      : [];
    const variations = Array.isArray(payload.variations)
      ? (payload.variations as Record<string, unknown>[])
      : [];
    const copyCount = Array.isArray(payload.copy_variations)
      ? payload.copy_variations.length
      : text(payload.copy_text)
        ? 1
        : 0;
    return {
      item_id: project.id,
      title: project.title,
      mode: isVideo(payload) ? "video" : "static",
      format: payload.format ?? (isVideo(payload) ? "9:16" : "1:1"),
      visual_style: payload.visual_style ?? null,
      brand: {
        logo: !!payload.logo_url,
        style_references: Array.isArray(payload.style_references)
          ? payload.style_references.length
          : 0,
        brand_book: !!payload.brand_book,
        character: !!video.character_ref_url,
      },
      engines: isVideo(payload)
        ? {
            still_model: video.still_model ?? "gpt-image-1",
            scene_engine: video.scene_engine ?? "mock",
            sound_engine: video.sound_engine ?? "elevenlabs",
            voice_id: video.voice_id ?? null,
          }
        : undefined,
      production: asRecord(video.production).status ?? null,
      scenes: scenes.map((scene, index) => ({
        number: index + 1,
        title: scene.title,
        status: scene.status,
        duration_s: scene.duration_s,
        has_still: !!scene.still_asset_id,
        has_clip: !!scene.clip_asset_id,
        clip_outdated: scene.clip_stale === true,
        has_voice: !!scene.voice_asset_id,
        visual_prompt: text(scene.visual_prompt, 300),
        overlay_text: text(scene.overlay_text, 160),
        voiceover_text: text(scene.voiceover_text, 300),
      })),
      variations: variations.slice(0, 24).map((variation, index) => ({
        number: index + 1,
        id: variation.id,
        label: variation.copyLabel ?? variation.label ?? null,
        status: variation.status ?? null,
        layers: variation.liveText === true,
      })),
      copy_count: copyCount,
      missing: missingForStudio(payload, {
        scenes: scenes.length,
        copy: copyCount,
      }),
    };
  }

  if (name === "update_studio_settings") {
    const nextVideo = { ...video };
    const next = { ...payload };
    const changed: string[] = [];
    const format = pick(FORMATS, args.format);
    if (format) {
      next.format = format;
      changed.push(`פורמט ${format}`);
    }
    const style = text(args.visual_style, 80);
    if (style) {
      next.visual_style = style;
      changed.push(`סגנון ${style}`);
    }
    const stillModel = pick(STILL_MODELS, args.still_model);
    if (stillModel) {
      nextVideo.still_model = stillModel;
      changed.push(`מודל פריימים ${stillModel}`);
    }
    const sceneEngine = pick(SCENE_ENGINES, args.scene_engine);
    if (sceneEngine) {
      nextVideo.scene_engine = sceneEngine;
      changed.push(`מנוע הנפשה ${sceneEngine}`);
    }
    const soundEngine = pick(SOUND_ENGINES, args.sound_engine);
    if (soundEngine) {
      nextVideo.sound_engine = soundEngine;
      changed.push(`סאונד ${soundEngine}`);
    }
    const voice = text(args.voice_id, 80);
    if (voice) {
      nextVideo.voice_id = voice;
      changed.push("קול קריינות");
    }
    if (changed.length === 0) return { error: "לא נמסרה הגדרה תקינה לשינוי" };
    next.video = nextVideo;
    await savePayload(supabase, tenantId, project, next);
    return { updated: true, changed };
  }

  if (name === "attach_to_project") {
    const role = pick(ATTACH_ROLES, args.role);
    const url = args.file_url;
    if (!role) return { error: "role לא תקין" };
    if (!isHttpUrl(url)) return { error: "file_url חייב להיות קישור https" };
    const fileName = text(args.file_name, 200);
    const next = { ...payload };
    if (role === "logo") next.logo_url = url;
    if (role === "style_reference") {
      const refs = Array.isArray(payload.style_references)
        ? [...(payload.style_references as unknown[])]
        : [];
      if (!refs.some((ref) => asRecord(ref).url === url))
        refs.push({ url, ...(fileName ? { name: fileName } : {}) });
      next.style_references = refs.slice(-12);
    }
    if (role === "brand_book") {
      next.brand_book = {
        ...asRecord(payload.brand_book),
        colors: Array.isArray(asRecord(payload.brand_book).colors)
          ? asRecord(payload.brand_book).colors
          : [],
        notes: text(asRecord(payload.brand_book).notes) ?? "",
        source: "upload",
        fileUrl: url,
        ...(fileName ? { fileName } : {}),
      };
    }
    if (role === "character") {
      next.video = { ...video, character_ref_url: url };
    }
    await savePayload(supabase, tenantId, project, next);
    return { attached: true, role };
  }

  if (
    name === "edit_scene" ||
    name === "add_scene" ||
    name === "delete_scene"
  ) {
    if (!isVideo(payload)) return { error: "זה לא פרויקט וידאו" };
    const scenes = await loadScenes(supabase, tenantId, itemId);
    const fields: Record<string, unknown> = {};
    for (const key of [
      "title",
      "visual_prompt",
      "motion_prompt",
      "overlay_text",
      "voiceover_text",
    ]) {
      const value = text(args[key]);
      if (value !== undefined) fields[key] = value;
    }
    if (args.duration_s !== undefined) {
      const seconds = Number(args.duration_s);
      if (!Number.isFinite(seconds)) return { error: "duration_s לא תקין" };
      fields.duration_s = Math.min(120, Math.max(0.5, seconds));
    }

    if (name === "edit_scene") {
      const scene = sceneAt(scenes, args.scene_number);
      if (!scene) return { error: `אין סצנה ${args.scene_number}` };
      if (Object.keys(fields).length === 0)
        return { error: "לא נמסר שדה לעדכון" };
      const { error } = await supabase
        .from("marketing_video_scenes")
        .update(fields)
        .eq("id", scene.id)
        .eq("tenant_id", tenantId);
      if (error) return { error: error.message };
      return {
        updated: true,
        scene_number: Number(args.scene_number),
        needs_new_still: "visual_prompt" in fields,
        ui_action: { type: "focus_scene", scene_id: scene.id },
      };
    }

    if (name === "add_scene") {
      const after =
        args.after_scene_number === undefined ||
        args.after_scene_number === null
          ? scenes.length
          : Math.max(
              0,
              Math.min(
                scenes.length,
                Math.round(Number(args.after_scene_number)),
              ),
            );
      const before = scenes[after - 1];
      const nextScene = scenes[after];
      const position = nextScene
        ? before
          ? (Number(before.position) + Number(nextScene.position)) / 2
          : Number(nextScene.position) - 1
        : before
          ? Number(before.position) + 1
          : 1;
      const { data, error } = await supabase
        .from("marketing_video_scenes")
        .insert({
          tenant_id: tenantId,
          item_id: itemId,
          position,
          title: fields.title ?? `סצנה ${after + 1}`,
          shot: "Medium shot",
          visual_prompt: fields.visual_prompt ?? "",
          motion_prompt: fields.motion_prompt ?? "",
          overlay_text: fields.overlay_text ?? "",
          voiceover_text: fields.voiceover_text ?? "",
          duration_s: fields.duration_s ?? 3,
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      return {
        added: true,
        scene_number: after + 1,
        ui_action: { type: "focus_scene", scene_id: asRecord(data).id },
      };
    }

    const scene = sceneAt(scenes, args.scene_number);
    if (!scene) return { error: `אין סצנה ${args.scene_number}` };
    if (args.confirmed !== true)
      return {
        needs_confirmation: true,
        message: `למחוק את סצנה ${args.scene_number} (${scene.title || "ללא שם"})? אשרו ואמחק.`,
      };
    const { error } = await supabase
      .from("marketing_video_scenes")
      .delete()
      .eq("id", scene.id)
      .eq("tenant_id", tenantId);
    if (error) return { error: error.message };
    return { deleted: true, scene_number: Number(args.scene_number) };
  }

  // studio_ui_action
  const action = pick(UI_ACTIONS, args.action) as UiAction | undefined;
  if (!action) return { error: "action לא תקין" };
  const videoOnly: UiAction[] = [
    "produce_video",
    "regenerate_frame",
    "animate_scene",
    "focus_scene",
  ];
  const staticOnly: UiAction[] = [
    "generate_variations",
    "single_variation",
    "revise_variation",
    "focus_variation",
  ];
  if (videoOnly.includes(action) && !isVideo(payload))
    return { error: "הפעולה הזו היא לסרטון, והפרויקט סטטי" };
  if (staticOnly.includes(action) && isVideo(payload))
    return { error: "הפעולה הזו היא לפוסט סטטי, והפרויקט סרטון" };

  const uiAction: Record<string, unknown> = { type: action, item_id: itemId };
  if (["regenerate_frame", "animate_scene", "focus_scene"].includes(action)) {
    const scenes = await loadScenes(supabase, tenantId, itemId);
    const scene = sceneAt(scenes, args.scene_number);
    if (!scene) return { error: `אין סצנה ${args.scene_number}` };
    uiAction.scene_id = scene.id;
  }
  if (["revise_variation", "focus_variation"].includes(action)) {
    const variations = Array.isArray(payload.variations)
      ? (payload.variations as Record<string, unknown>[])
      : [];
    const id = text(args.variation_id, 80);
    if (!id || !variations.some((variation) => variation.id === id))
      return { error: "variation_id לא נמצא בפרויקט" };
    uiAction.variation_id = id;
  }
  const note = text(args.note, 1000);
  if (note) uiAction.note = note;
  if (typeof args.text_as_layers === "boolean")
    uiAction.text_as_layers = args.text_as_layers;
  if (typeof args.mixed_structure === "boolean")
    uiAction.mixed_structure = args.mixed_structure;
  const drawer = pick(DRAWERS, args.drawer);
  if (action === "open_drawer") {
    if (!drawer) return { error: "drawer לא תקין" };
    uiAction.drawer = drawer;
  }
  const paid = [
    "produce_video",
    "generate_variations",
    "single_variation",
    "revise_variation",
    "regenerate_frame",
    "animate_scene",
  ].includes(action);
  return {
    sent_to_studio: true,
    ui_action: uiAction,
    message: paid
      ? "נפתח על המסך חלון עם העלות לאישור. הפעולה תרוץ רק אחרי שהמשתמש יאשר שם."
      : "בוצע בסטודיו.",
  };
}
