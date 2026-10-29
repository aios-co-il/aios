/** Carmen tools for the video director skin. Plain TypeScript, no Deno APIs. */

const ASPECTS = new Set(["9:16", "16:9", "1:1", "4:5"]);

export const VIDEO_DIRECTOR_TOOLS = [
  {
    name: "get_video_storyboard",
    description:
      "סטוריבורד של פרויקט וידאו: סצנות, סטטוס, קליפ נוכחי, קריינות, מוזיקה והרכב אחרון.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה פרויקט הקריאייטיב" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "render_video_film",
    description:
      "שולח הרכבת סרט מהקליפ הנוכחי של כל סצנה (סצנה בלי קליפ לא נכנסת). ההרכבה מקומית ולא עולה כסף. לא מפעיל מנועי סצנות ולא יוצר אפקטי סאונד (משתמש רק באפקטים שכבר נוצרו בהפקה).",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        aspect: {
          type: "string",
          enum: ["9:16", "16:9", "1:1", "4:5"],
        },
      },
      required: ["item_id"],
    },
  },
];

export const isVideoDirectorTool = (name: string) =>
  VIDEO_DIRECTOR_TOOLS.some((tool) => tool.name === name);

type QueryResult = { data: unknown; error: { message: string } | null };

type Query = {
  eq: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  limit: (...args: unknown[]) => Query;
  maybeSingle: () => PromiseLike<QueryResult>;
  then: (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => PromiseLike<unknown>;
};

type VideoDirectorTable =
  | "marketing_work_items"
  | "marketing_video_scenes"
  | "marketing_assets"
  | "marketing_runs";

/** Builders stay `unknown` here so the generated-schema client fits without deep generic comparison. */
export type VideoDirectorDb = {
  from(table: VideoDirectorTable): { select(columns: string): unknown };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<QueryResult>;
};

const QUERY_METHODS = ["eq", "order", "limit", "maybeSingle", "then"];

const isQuery = (value: unknown): value is Query =>
  typeof value === "object" &&
  value !== null &&
  QUERY_METHODS.every((key) => typeof Reflect.get(value, key) === "function");

const UNSUPPORTED_CLIENT = { error: "לקוח מסד נתונים לא נתמך" };

const selectFrom = (
  supabase: VideoDirectorDb,
  table: VideoDirectorTable,
  columns: string,
) => {
  const query = supabase.from(table).select(columns);
  return isQuery(query) ? query : null;
};

const rowsOf = (data: unknown) => (Array.isArray(data) ? data : []);

/**
 * Runs with the service-role client, so RLS does not apply: every call first loads the
 * project inside the caller's tenant and checks client access before touching it.
 */
export async function executeVideoDirectorTool(
  supabase: VideoDirectorDb,
  tenantId: string,
  name: string,
  args: Record<string, unknown>,
  assertClientAccess: (clientId: string) => Promise<void> = async () => {},
) {
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  if (!isVideoDirectorTool(name)) return { error: "כלי לא מוכר" };

  const itemQuery = selectFrom(
    supabase,
    "marketing_work_items",
    "id, title, client_id, current_stage_id, payload",
  );
  if (!itemQuery) return UNSUPPORTED_CLIENT;
  const item = await itemQuery
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (item.error) return { error: item.error.message };
  if (!item.data) return { error: "פרויקט לא נמצא" };
  const project = item.data as {
    id: string;
    title: string | null;
    client_id: string | null;
    current_stage_id: string | null;
    payload?: { video?: { scene_engine?: string; sound_engine?: string } };
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

  if (name === "get_video_storyboard") {
    const scenesQuery = selectFrom(
      supabase,
      "marketing_video_scenes",
      "id, position, title, status, duration_s, overlay_text, voiceover_text, clip_asset_id, voice_asset_id",
    );
    const musicQuery = selectFrom(
      supabase,
      "marketing_assets",
      "id, url, created_at",
    );
    const renderQuery = selectFrom(
      supabase,
      "marketing_runs",
      "id, status, error, output, created_at",
    );
    if (!scenesQuery || !musicQuery || !renderQuery) return UNSUPPORTED_CLIENT;
    const scenes = await scenesQuery
      .eq("item_id", itemId)
      .eq("tenant_id", tenantId)
      .order("position");
    if (scenes.error) return { error: scenes.error.message };
    const music = await musicQuery
      .eq("item_id", itemId)
      .eq("tenant_id", tenantId)
      .eq("type", "music")
      .order("created_at", { ascending: false })
      .limit(1);
    if (music.error) return { error: music.error.message };
    const render = await renderQuery
      .eq("item_id", itemId)
      .eq("tenant_id", tenantId)
      .eq("kind", "render")
      .order("created_at", { ascending: false })
      .limit(1);
    if (render.error) return { error: render.error.message };
    const sceneRows = rowsOf(scenes.data) as { status?: string }[];
    return {
      item_id: project.id,
      title: project.title,
      client_id: project.client_id,
      stage_id: project.current_stage_id,
      scene_engine: project.payload?.video?.scene_engine ?? "mock",
      sound_engine: project.payload?.video?.sound_engine ?? "elevenlabs",
      clip_count: sceneRows.filter((scene) => !!scene.clip_asset_id).length,
      approved_count: sceneRows.filter(
        (scene) => scene.status === "clip_approved",
      ).length,
      scenes: sceneRows,
      music: rowsOf(music.data)[0] ?? null,
      latest_render: rowsOf(render.data)[0] ?? null,
    };
  }

  if (name === "render_video_film") {
    const requested = String(args.aspect ?? "");
    const aspect = ASPECTS.has(requested) ? requested : "9:16";
    // The project's own stage; a stage id from the conversation is not trusted.
    const queued = await supabase.rpc("queue_video_render", {
      p_item_id: project.id,
      p_aspect: aspect,
      p_stage_id: project.current_stage_id,
    });
    if (queued.error) {
      if (queued.error.message.includes("no approved clips"))
        return { error: "אין לסצנות קליפים להרכבה" };
      return { error: queued.error.message };
    }
    const runs = rowsOf(queued.data) as { id?: string }[];
    if (runs.length === 0)
      return { queued: false, message: "סרט כבר בהרכבה", cost_usd: 0 };
    return {
      queued: true,
      run_id: runs[0]?.id ?? null,
      cost_usd: 0,
      provider: "compose",
    };
  }

  return { error: "כלי לא מוכר" };
}
