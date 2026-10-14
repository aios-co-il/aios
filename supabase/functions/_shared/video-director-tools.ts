/** Carmen tools for the video director skin. Plain TypeScript, no Deno APIs. */

const ASPECTS = new Set(["9:16", "16:9", "1:1", "4:5"]);

export const VIDEO_DIRECTOR_TOOLS = [
  {
    name: "get_video_storyboard",
    description:
      "סטוריבורד של פרויקט וידאו: סצנות, סטטוס, קליפ מאושר, קריינות, מוזיקה והרכב אחרון.",
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
      "שולח הרכבת סרט מהקליפים המאושרים. ההרכבה מקומית ולא עולה כסף. לא מפעיל מנועי סצנות.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        aspect: {
          type: "string",
          enum: ["9:16", "16:9", "1:1", "4:5"],
        },
        stage_id: { type: "string" },
      },
      required: ["item_id"],
    },
  },
];

export const isVideoDirectorTool = (name: string) =>
  VIDEO_DIRECTOR_TOOLS.some((tool) => tool.name === name);

type QueryResult = { data: unknown; error: { message: string } | null };

type Query = {
  select: (...args: unknown[]) => Query;
  eq: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  limit: (...args: unknown[]) => Query;
  maybeSingle: () => Promise<QueryResult>;
  then: (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

export type VideoDirectorDb = {
  from: (table: string) => Query;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<QueryResult>;
};

const rowsOf = (data: unknown) => (Array.isArray(data) ? data : []);

export async function executeVideoDirectorTool(
  supabase: VideoDirectorDb,
  tenantId: string,
  name: string,
  args: Record<string, unknown>,
) {
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };

  if (name === "get_video_storyboard") {
    const item = await supabase
      .from("marketing_work_items")
      .select("id, title, client_id, current_stage_id, payload")
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
    const scenes = await supabase
      .from("marketing_video_scenes")
      .select(
        "id, position, title, status, duration_s, overlay_text, voiceover_text, clip_asset_id, voice_asset_id",
      )
      .eq("item_id", itemId)
      .eq("tenant_id", tenantId)
      .order("position");
    if (scenes.error) return { error: scenes.error.message };
    const music = await supabase
      .from("marketing_assets")
      .select("id, url, created_at")
      .eq("item_id", itemId)
      .eq("tenant_id", tenantId)
      .eq("type", "music")
      .order("created_at", { ascending: false })
      .limit(1);
    if (music.error) return { error: music.error.message };
    const render = await supabase
      .from("marketing_runs")
      .select("id, status, error, output, created_at")
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
    const stageId =
      typeof args.stage_id === "string" && args.stage_id.trim()
        ? args.stage_id.trim()
        : null;
    const queued = await supabase.rpc("queue_video_render", {
      p_item_id: itemId,
      p_aspect: aspect,
      p_stage_id: stageId,
    });
    if (queued.error) {
      if (queued.error.message.includes("no approved clips"))
        return { error: "אין קליפים מאושרים להרכבה" };
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
