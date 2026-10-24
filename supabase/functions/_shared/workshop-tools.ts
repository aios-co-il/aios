/**
 * Carmen's workshop tools. Plain TypeScript, no Deno APIs.
 *
 * The user says what they want in one sentence; these tools decide type, format, style and
 * folder (see workshop/defaults.ts), do the work on the server and record every result as a
 * page on the workshop board (workshop_artifacts). Nothing here needs an open screen.
 *
 * Every call loads the project inside the caller's tenant and checks client access; the agent
 * runs with the service role, so RLS does not apply.
 */

import { artifactRow, type ArtifactInput } from "./workshop/artifacts.ts";
import {
  estimateImages,
  imageFormatsFrom,
  planProject,
  type Format,
  type StartProjectPlan,
} from "./workshop/defaults.ts";
import { executeCreativeStudioTool } from "./creative-studio-tools.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export const WORKSHOP_TOOLS = [
  {
    name: "workshop_start_project",
    description:
      "פותחת פרויקט חדש בסדנה מבקשה חופשית אחת. מסיקה לבד סוג (סרטון, מודעה, קמפיין), פורמט לפי הערוץ, אורך וסצנות, וסגנון. לא שואלים את המשתמש על הגדרות. מחזירה item_id לשאר הכלים. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        brief: {
          type: "string",
          description: "הבקשה של המשתמש במילותיו, כולל נושא וערוץ",
        },
        title: { type: "string", description: "כותרת קצרה (אופציונלי)" },
        client_id: {
          type: "string",
          description: "מזהה לקוח, אם ידוע מהשיחה (אופציונלי)",
        },
        kind: {
          type: "string",
          enum: ["video", "static", "campaign"],
          description: "רק אם המשתמש אמר במפורש; אחרת מסיקים מהבקשה",
        },
        formats: {
          type: "array",
          items: { type: "string", enum: ["9:16", "4:5", "1:1", "16:9"] },
          description: "רק אם המשתמש ביקש גדלים מסוימים",
        },
        duration_s: {
          type: "number",
          description: "אורך סרט בשניות, רק אם המשתמש ציין",
        },
        visual_style: { type: "string" },
      },
      required: ["brief"],
    },
  },
  {
    name: "workshop_get_state",
    description:
      "מצב הפרויקט הפתוח בסדנה: מה כבר נוצר (עמודים בלוח), מה חסר, מה רץ עכשיו. קראי לזה בתחילת שיחה על פרויקט קיים.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט מהקשר הסדנה" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "workshop_make_creative",
    description:
      "יוצרת תמונות מודעה או פוסט לפרויקט, בגודל לכל ערוץ שביקשו (למשל סטורי ופיד). כל תמונה מופיעה כעמוד בלוח. עולה כסף: קודם הציגי למשתמש את העלות מהחזרה של confirmed=false וחכי שיאשר במפורש, ורק אז קראי שוב עם confirmed=true. אישור אחד מכסה את כל ההפקה.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט" },
        prompt: {
          type: "string",
          description:
            "תיאור מפורט של הוויזואל באנגלית: נושא, סגנון, תאורה, קומפוזיציה, בלי טקסט על התמונה",
        },
        formats: {
          type: "array",
          items: { type: "string", enum: ["9:16", "4:5", "1:1", "16:9"] },
          description: "ברירת מחדל: הפורמטים של הפרויקט",
        },
        confirmed: {
          type: "boolean",
          description:
            "true רק אחרי שהמשתמש אישר את העלות בהודעה שלו בשיחה הזו. בלי אישור: false.",
        },
      },
      required: ["item_id", "prompt"],
    },
  },
];

export const isWorkshopTool = (name: string) =>
  WORKSHOP_TOOLS.some((tool) => tool.name === name);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const DEFAULT_STAGES = [
  ["strategy", "בריף"],
  ["copy", "כתיבת תוכן"],
  ["creative", "קריאייטיב"],
  ["target_paid", "קמפיין ממומן"],
  ["measurement", "מדידה"],
] as const;

/** The client's creative stage in its campaigns pipeline, created with the default stages when missing. */
async function creativeStageFor(
  supabase: Db,
  tenantId: string,
  clientId: string,
): Promise<{ pipelineId: string; stageId: string }> {
  let { data: pipeline } = await supabase
    .from("marketing_pipelines")
    .select("id")
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .eq("track", "campaigns")
    .maybeSingle();
  if (!pipeline) {
    const created = await supabase
      .from("marketing_pipelines")
      .insert({ client_id: clientId, tenant_id: tenantId, track: "campaigns" })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);
    pipeline = created.data;
  }
  const existing = await supabase
    .from("marketing_pipeline_stages")
    .select("id, stage_type")
    .eq("pipeline_id", pipeline.id);
  let stages = (existing.data ?? []) as { id: string; stage_type: string }[];
  if (stages.length === 0) {
    const inserted = await supabase
      .from("marketing_pipeline_stages")
      .insert(
        DEFAULT_STAGES.map(([stage_type, name], sort_order) => ({
          stage_type,
          name,
          sort_order,
          position_x: (DEFAULT_STAGES.length - sort_order) * 280 - 280,
          position_y: 200,
          pipeline_id: pipeline.id,
          tenant_id: tenantId,
          approval_mode: "manual",
          configuration: {},
        })),
      )
      .select("id, stage_type");
    if (inserted.error) throw new Error(inserted.error.message);
    stages = inserted.data as { id: string; stage_type: string }[];
  }
  const stage = stages.find((entry) => entry.stage_type === "creative");
  if (!stage) throw new Error("שלב הקריאייטיב לא נמצא בפייפליין");
  return { pipelineId: pipeline.id, stageId: stage.id };
}

export async function recordArtifact(supabase: Db, input: ArtifactInput) {
  const { data, error } = await supabase
    .from("workshop_artifacts")
    .insert(artifactRow(input))
    .select("id, kind, title, folder, status, url, thumb_url")
    .single();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    kind: string;
    title: string;
    folder: string;
    status: string;
    url: string | null;
    thumb_url: string | null;
  };
}

const briefPayload = (plan: StartProjectPlan, brief: string) => ({
  brief_text: brief,
  format: plan.format,
  project_type: plan.projectType,
  visual_style: plan.visualStyle,
  content_type: plan.contentType,
  department: "creative",
  intake_source: "carmen",
  workshop: {
    kind: plan.kind,
    formats: plan.formats,
    film: plan.film,
  },
});

/** What the edge function injects so this module stays free of Deno and provider code. */
export interface WorkshopDeps {
  generateImage?: (
    prompt: string,
    format: Format,
  ) => Promise<{ image_url?: string; error?: string }>;
}

async function loadProject(
  supabase: Db,
  tenantId: string,
  itemId: string,
  assertClientAccess: (clientId: string) => Promise<void>,
) {
  const loaded = await supabase
    .from("marketing_work_items")
    .select("id, title, client_id, payload")
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
      payload: asRecord(loaded.data.payload),
    },
  };
}

export async function executeWorkshopTool(
  supabase: Db,
  tenantId: string,
  name: string,
  args: Record<string, unknown>,
  assertClientAccess: (clientId: string) => Promise<void> = async () => {},
  userId: string | null = null,
  deps: WorkshopDeps = {},
) {
  if (!isWorkshopTool(name)) return { error: "כלי לא מוכר" };

  if (name === "workshop_start_project") {
    const brief = String(args.brief ?? "").trim();
    if (!brief) return { error: "brief נדרש" };
    const clientId = String(args.client_id ?? "").trim() || null;
    if (clientId) {
      try {
        await assertClientAccess(clientId);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
        };
      }
    }
    const plan = planProject({
      brief,
      title: typeof args.title === "string" ? args.title : undefined,
      kind: ["video", "static", "campaign"].includes(String(args.kind))
        ? (args.kind as StartProjectPlan["kind"])
        : undefined,
      formats: Array.isArray(args.formats)
        ? (args.formats as unknown[]).map(String)
        : undefined,
      duration_s:
        typeof args.duration_s === "number" ? args.duration_s : undefined,
      visual_style:
        typeof args.visual_style === "string" ? args.visual_style : undefined,
    });
    let pipelineId: string | null = null;
    let stageId: string | null = null;
    if (clientId) {
      try {
        ({ pipelineId, stageId } = await creativeStageFor(
          supabase,
          tenantId,
          clientId,
        ));
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "פתיחת הפייפליין נכשלה",
        };
      }
    }
    const created = await supabase
      .from("marketing_work_items")
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        pipeline_id: pipelineId,
        current_stage_id: stageId,
        title: plan.title,
        status: "draft",
        target_channel: plan.projectType === "video" ? "video" : "creative",
        payload: briefPayload(plan, brief),
        created_by: userId,
      })
      .select("id")
      .single();
    if (created.error) return { error: created.error.message };
    const itemId = created.data.id as string;
    const artifact = await recordArtifact(supabase, {
      tenantId,
      itemId,
      kind: "brief",
      title: plan.title,
      meta: { summary: plan.summary, brief, plan },
    });
    return {
      success: true,
      item_id: itemId,
      title: plan.title,
      decided: {
        kind: plan.kind,
        format: plan.format,
        formats: plan.formats,
        visual_style: plan.visualStyle,
        film: plan.film,
      },
      summary: plan.summary,
      client_known: !!clientId,
      artifact,
      workshop: { event: "project", item_id: itemId, artifact_id: artifact.id },
    };
  }

  if (name === "workshop_get_state") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const studio = (await executeCreativeStudioTool(
      supabase,
      tenantId,
      "get_studio_state",
      { item_id: itemId },
      assertClientAccess,
    )) as Record<string, unknown>;
    if (studio.error) return studio;
    const [artifacts, running, item] = await Promise.all([
      supabase
        .from("workshop_artifacts")
        .select("id, kind, title, folder, status")
        .eq("item_id", itemId)
        .eq("tenant_id", tenantId)
        .order("created_at"),
      supabase
        .from("marketing_runs")
        .select("kind, status")
        .eq("item_id", itemId)
        .eq("tenant_id", tenantId)
        .in("status", ["queued", "running"]),
      supabase
        .from("marketing_work_items")
        .select("payload")
        .eq("id", itemId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);
    return {
      ...studio,
      artifacts: artifacts.data ?? [],
      running: running.data ?? [],
      plan: asRecord(asRecord(item.data?.payload).workshop),
    };
  }

  if (name === "workshop_make_creative") {
    const itemId = String(args.item_id ?? "").trim();
    const prompt = String(args.prompt ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    if (!prompt) return { error: "prompt נדרש" };
    if (!deps.generateImage) return { error: "יצירת תמונות לא זמינה כאן" };
    const loaded = await loadProject(supabase, tenantId, itemId, assertClientAccess);
    if ("error" in loaded) return loaded;
    const { project } = loaded;
    const projectFormats = imageFormatsFrom(
      asRecord(project.payload.workshop).formats,
      imageFormatsFrom([project.payload.format], ["1:1"]),
    );
    const formats = imageFormatsFrom(args.formats, projectFormats).slice(0, 3);
    const estimate = estimateImages(formats);
    if (args.confirmed !== true) {
      return {
        needs_approval: true,
        formats,
        images: estimate.images,
        estimated_usd: estimate.usd,
        message: `הפקה של ${estimate.images} תמונות (${formats.join(", ")}) תעלה עד כ-$${estimate.usd}. אשר/י והתחל.`,
      };
    }
    const results = await Promise.all(
      formats.map(async (format) => {
        try {
          const made = await deps.generateImage!(prompt, format);
          return { format, ...made };
        } catch (error) {
          return {
            format,
            error: error instanceof Error ? error.message : "יצירת התמונה נכשלה",
          };
        }
      }),
    );
    const artifacts = [];
    for (const result of results) {
      if (!result.image_url) continue;
      artifacts.push(
        await recordArtifact(supabase, {
          tenantId,
          itemId,
          kind: "image",
          title: `${project.title || "תמונה"} · ${result.format}`,
          url: result.image_url,
          meta: { prompt, format: result.format },
        }),
      );
    }
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

  return { error: "כלי לא מוכר" };
}
