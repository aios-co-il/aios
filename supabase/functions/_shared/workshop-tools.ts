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
import {
  ENGINE_LABEL,
  isSceneEngine,
  productionEstimate,
  type SceneEngine,
} from "./workshop/video-cost.ts";
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
    name: "workshop_assign_client",
    description:
      "משייכת פרויקט קיים ללקוח (או מסירה את השיוך כשלא שולחים client_id). פרויקט יכול להתקיים בלי לקוח, והשיוך אפשרי בכל שלב. לא עולה כסף. אפשר לחפש את מזהה הלקוח עם search_entities.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט" },
        client_id: {
          type: "string",
          description: "מזהה הלקוח; בלי זה השיוך מוסר",
        },
      },
      required: ["item_id"],
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
  {
    name: "workshop_save_concepts",
    description:
      "שומרת קונספטים שכתבת לפרויקט, כל אחד כעמוד בלוח. קודם חשבי על 3 עד 5 כיוונים שונים באמת, ואז שמרי. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        concepts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              idea: { type: "string", description: "הרעיון במשפטים ספורים" },
              visual: { type: "string", description: "הכיוון הוויזואלי" },
            },
            required: ["title", "idea"],
          },
        },
      },
      required: ["item_id", "concepts"],
    },
  },
  {
    name: "workshop_save_copy",
    description:
      "שומרת נוסחי קופי שכתבת (כותרת, גוף, קריאה לפעולה), כל נוסח כעמוד בלוח. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        variations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              headline: { type: "string" },
              body: { type: "string" },
              cta: { type: "string" },
            },
            required: ["headline", "body"],
          },
        },
      },
      required: ["item_id", "variations"],
    },
  },
  {
    name: "workshop_storyboard",
    description:
      "שומרת סטוריבורד שכתבת לסרטון: סצנות עם תיאור ויזואלי, תנועה, טקסט על המסך וקריינות. כל סצנה כ-3 שניות, אלא אם יש סיבה. אם כבר יש סטוריבורד, replace=true מחליף אותו. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        replace: { type: "boolean" },
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              shot: {
                type: "string",
                description: "למשל Medium shot, Close-up, Wide shot",
              },
              visual_prompt: {
                type: "string",
                description: "תיאור הפריים באנגלית, בלי טקסט על התמונה",
              },
              motion_prompt: {
                type: "string",
                description: "איך הפריים זז, באנגלית",
              },
              overlay_text: { type: "string" },
              voiceover_text: {
                type: "string",
                description: "מה נאמר בסצנה, בעברית",
              },
              duration_s: { type: "number" },
            },
            required: ["visual_prompt"],
          },
        },
      },
      required: ["item_id", "scenes"],
    },
  },
  {
    name: "workshop_make_stills",
    description:
      "יוצרת תמונה לכל סצנה שעדיין בלי תמונה (עד 10 בקריאה; אם נשארו, קראי שוב). עולה כסף: confirmed=false מחזיר עלות, ורק אחרי שהמשתמש אישר בהודעה שלו קראי עם confirmed=true.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "workshop_produce_video",
    description:
      "מפיקה את הסרט: מנפישה את הסצנות, מקריינת, מוסיפה מוזיקה ומרכיבה, ברקע, והסרט מופיע בלוח כשהוא מוכן. דורש שלכל סצנה יש תמונה. עולה כסף: confirmed=false מחזיר את העלות הכוללת, ורק אחרי שהמשתמש אישר בהודעה שלו קראי עם confirmed=true. אישור אחד מכסה הכול. לקוח לא נדרש: בלי לקוח הפרויקט נשמר ללא שיוך, ואפשר לשייך אותו אחר כך עם workshop_assign_client.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        confirmed: { type: "boolean" },
        client_id: { type: "string" },
        engine: {
          type: "string",
          enum: ["mock", "kling", "elevenlabs", "higgsfield"],
          description:
            "רק אם המשתמש ביקש מנוע מסוים; אחרת נבחר לפי המפתחות של הארגון",
        },
        voice_id: { type: "string" },
        music: { type: "boolean", description: "false רק אם ביקשו בלי מוזיקה" },
      },
      required: ["item_id"],
    },
  },
];

export const isWorkshopTool = (name: string) =>
  WORKSHOP_TOOLS.some((tool) => tool.name === name);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The creative stage runs are filed under: the client's, or the tenant's "no client" pipeline. */
async function creativeStageFor(
  supabase: Db,
  tenantId: string,
  clientId: string | null,
): Promise<{ pipelineId: string; stageId: string }> {
  const { data, error } = await supabase.rpc("workshop_creative_stage", {
    p_tenant_id: tenantId,
    p_client_id: clientId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    { pipeline_id?: string; stage_id?: string } | null | undefined;
  if (!row?.pipeline_id || !row?.stage_id)
    throw new Error("שלב הקריאייטיב לא נמצא בפייפליין");
  return { pipelineId: row.pipeline_id, stageId: row.stage_id };
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

const STILLS_PER_CALL = 10;
const STILL_CONCURRENCY = 4;

const SCENE_COLUMNS =
  "id, position, title, status, duration_s, visual_prompt, motion_prompt, overlay_text, voiceover_text, still_asset_id, clip_asset_id";

async function loadScenes(supabase: Db, tenantId: string, itemId: string) {
  const { data } = await supabase
    .from("marketing_video_scenes")
    .select(SCENE_COLUMNS)
    .eq("item_id", itemId)
    .eq("tenant_id", tenantId)
    .order("position");
  return (Array.isArray(data) ? data : []) as Record<string, any>[];
}

/** What the edge function injects so this module stays free of Deno and provider code. */
export interface WorkshopDeps {
  generateImage?: (
    prompt: string,
    format: Format,
  ) => Promise<{ image_url?: string; error?: string }>;
  defaultEngine?: () => Promise<SceneEngine>;
}

async function loadProject(
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
          error:
            error instanceof Error ? error.message : "פתיחת הפייפליין נכשלה",
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

  if (name === "workshop_assign_client") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const wanted = String(args.client_id ?? "").trim() || null;
    if (wanted) {
      try {
        await assertClientAccess(wanted);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
        };
      }
    }
    const assigned = await supabase.rpc("workshop_assign_client", {
      p_item_id: itemId,
      p_client_id: wanted,
    });
    if (assigned.error) return { error: assigned.error.message };
    return {
      success: true,
      item_id: itemId,
      client_id: wanted,
      message: wanted
        ? "הפרויקט שויך ללקוח."
        : "השיוך ללקוח הוסר. הפרויקט נשאר בלי לקוח.",
      workshop: { event: "artifacts", item_id: itemId },
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
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
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
            error:
              error instanceof Error ? error.message : "יצירת התמונה נכשלה",
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

  if (name === "workshop_save_concepts" || name === "workshop_save_copy") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const isConcepts = name === "workshop_save_concepts";
    const list = (isConcepts ? args.concepts : args.variations) as unknown;
    const entries = (Array.isArray(list) ? list : [])
      .map((entry) => asRecord(entry))
      .slice(0, isConcepts ? 8 : 12);
    const pages = entries
      .map((entry) =>
        isConcepts
          ? {
              title: String(entry.title ?? "").trim(),
              text: [
                String(entry.idea ?? "").trim(),
                String(entry.visual ?? "").trim()
                  ? `ויזואל: ${String(entry.visual).trim()}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : {
              title: String(entry.headline ?? "").trim(),
              text: [entry.headline, entry.body, entry.cta]
                .map((part) => String(part ?? "").trim())
                .filter(Boolean)
                .join("\n\n"),
            },
      )
      .filter((page) => page.title && page.text);
    if (pages.length === 0)
      return { error: isConcepts ? "concepts ריק" : "variations ריק" };
    const artifacts = [];
    for (const page of pages)
      artifacts.push(
        await recordArtifact(supabase, {
          tenantId,
          itemId,
          kind: isConcepts ? "concept" : "copy",
          title: page.title,
          meta: { text: page.text },
        }),
      );
    if (!isConcepts && !loaded.project.payload.copy_text) {
      await supabase
        .from("marketing_work_items")
        .update({
          payload: { ...loaded.project.payload, copy_text: pages[0].text },
        })
        .eq("id", itemId)
        .eq("tenant_id", tenantId);
    }
    return {
      success: true,
      saved: artifacts.length,
      artifacts,
      workshop: {
        event: "artifacts",
        item_id: itemId,
        artifact_id: artifacts[artifacts.length - 1].id,
      },
    };
  }

  if (name === "workshop_storyboard") {
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
    const input = (Array.isArray(args.scenes) ? args.scenes : [])
      .map((scene) => asRecord(scene))
      .filter((scene) => String(scene.visual_prompt ?? "").trim())
      .slice(0, 20);
    if (input.length === 0)
      return { error: "scenes ריק: כל סצנה צריכה visual_prompt" };
    const old = await loadScenes(supabase, tenantId, itemId);
    if (old.length > 0 && args.replace !== true)
      return { error: "כבר יש סטוריבורד. replace=true יחליף אותו." };
    const rows = input.map((scene, index) => ({
      id: crypto.randomUUID(),
      position: index + 1,
      title: String(scene.title ?? "").trim() || `סצנה ${index + 1}`,
      shot: String(scene.shot ?? "").trim() || "Medium shot",
      visual_prompt: String(scene.visual_prompt).trim(),
      motion_prompt: String(scene.motion_prompt ?? "").trim(),
      overlay_text: String(scene.overlay_text ?? "").trim(),
      voiceover_text: String(scene.voiceover_text ?? "").trim(),
      duration_s: Math.min(Math.max(Number(scene.duration_s) || 3, 0.5), 120),
    }));
    const saved = await supabase.rpc("save_video_storyboard", {
      p_item_id: itemId,
      p_scenes: rows,
    });
    if (saved.error) return { error: saved.error.message };
    if (old.length > 0) {
      const removed = await supabase
        .from("marketing_video_scenes")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("item_id", itemId)
        .in(
          "id",
          old.map((scene) => scene.id),
        );
      if (removed.error) return { error: removed.error.message };
    }
    await supabase
      .from("marketing_work_items")
      .update({ payload: { ...project.payload, project_type: "video" } })
      .eq("id", itemId)
      .eq("tenant_id", tenantId);
    const total = rows.reduce((sum, scene) => sum + scene.duration_s, 0);
    const artifact = await recordArtifact(supabase, {
      tenantId,
      itemId,
      kind: "storyboard",
      title: `סטוריבורד · ${rows.length} סצנות`,
      meta: {
        total_s: total,
        scenes: rows,
        text: rows
          .map(
            (scene) =>
              `${scene.position}. ${scene.title} (${scene.duration_s} ש׳)\n${scene.visual_prompt}${
                scene.voiceover_text ? `\nקריינות: ${scene.voiceover_text}` : ""
              }`,
          )
          .join("\n\n"),
      },
    });
    return {
      success: true,
      scenes: rows.length,
      total_s: total,
      artifact,
      workshop: {
        event: "artifacts",
        item_id: itemId,
        artifact_id: artifact.id,
      },
    };
  }

  if (name === "workshop_make_stills") {
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
    const pending = scenes.filter((scene) => !scene.still_asset_id);
    if (pending.length === 0)
      return { success: true, created: 0, remaining: 0 };
    const batch = pending.slice(0, STILLS_PER_CALL);
    const format = imageFormatsFrom([project.payload.format], ["9:16"])[0];
    const estimate = estimateImages([format], batch.length);
    if (args.confirmed !== true)
      return {
        needs_approval: true,
        scenes: batch.length,
        remaining_after: pending.length - batch.length,
        estimated_usd: estimate.usd,
        message: `${batch.length} תמונות לסצנות יעלו עד כ-$${estimate.usd}. אשר/י והתחל.`,
      };
    const results: { scene: string; ok: boolean; error?: string }[] = [];
    for (let i = 0; i < batch.length; i += STILL_CONCURRENCY) {
      const chunk = batch.slice(i, i + STILL_CONCURRENCY);
      results.push(
        ...(await Promise.all(
          chunk.map(async (scene) => {
            try {
              const made = await deps.generateImage!(
                `${scene.visual_prompt}. Cinematic still frame for a video storyboard. Keep the same character, wardrobe and visual style in every scene. No text on the image.`,
                format,
              );
              if (!made.image_url)
                return {
                  scene: scene.id,
                  ok: false,
                  error: made.error ?? "לא התקבלה תמונה",
                };
              const attached = await supabase.rpc("attach_video_scene_asset", {
                p_scene_id: scene.id,
                p_kind: "still",
                p_url: made.image_url,
                p_meta: { prompt: scene.visual_prompt, source: "workshop" },
              });
              return attached.error
                ? { scene: scene.id, ok: false, error: attached.error.message }
                : { scene: scene.id, ok: true };
            } catch (error) {
              return {
                scene: scene.id,
                ok: false,
                error:
                  error instanceof Error ? error.message : "יצירת התמונה נכשלה",
              };
            }
          }),
        )),
      );
    }
    const created = results.filter((result) => result.ok).length;
    return {
      success: created > 0,
      created,
      failed: results.filter((result) => !result.ok),
      remaining: pending.length - created,
      workshop: { event: "artifacts", item_id: itemId },
    };
  }

  if (name === "workshop_produce_video") {
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
    const noStill = scenes.filter((scene) => !scene.still_asset_id).length;
    if (noStill > 0)
      return {
        error: `לא לכל הסצנות יש תמונה (${noStill} חסרות). קודם workshop_make_stills.`,
        missing_stills: noStill,
      };

    let stageId = project.stage_id;
    let clientId = project.client_id;
    if (!stageId) {
      const wanted = String(args.client_id ?? "").trim() || clientId || null;
      try {
        if (wanted && wanted !== project.client_id)
          await assertClientAccess(wanted);
        const stage = await creativeStageFor(supabase, tenantId, wanted);
        if (wanted) {
          const linked = await supabase
            .from("marketing_work_items")
            .update({
              client_id: wanted,
              pipeline_id: stage.pipelineId,
              current_stage_id: stage.stageId,
            })
            .eq("id", itemId)
            .eq("tenant_id", tenantId);
          if (linked.error) return { error: linked.error.message };
        }
        stageId = stage.stageId;
        clientId = wanted;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "שיוך הלקוח נכשל",
        };
      }
    }

    const video = asRecord(project.payload.video);
    const engine: SceneEngine = isSceneEngine(args.engine)
      ? args.engine
      : isSceneEngine(video.scene_engine) && video.scene_engine !== "mock"
        ? video.scene_engine
        : deps.defaultEngine
          ? await deps.defaultEngine()
          : "mock";
    const costScenes = scenes
      .filter((scene) => !scene.clip_asset_id)
      .map((scene) => ({
        duration_s: Number(scene.duration_s) || 3,
        voiceover_text: String(scene.voiceover_text ?? ""),
      }));
    const withVoice = scenes.some((scene) =>
      String(scene.voiceover_text ?? "").trim(),
    );
    const withMusic = args.music !== false;
    const estimate = productionEstimate(engine, costScenes, {
      withVoice,
      withMusic,
    });
    if (args.confirmed !== true)
      return {
        needs_approval: true,
        engine,
        engine_label: ENGINE_LABEL[engine],
        scenes: scenes.length,
        clip_seconds: estimate.clipSeconds,
        with_voice: withVoice,
        with_music: withMusic,
        estimated_usd: estimate.totalUsd,
        message:
          engine === "mock"
            ? "הסרט יופק במנוע התצוגה החינמי (תנועה פשוטה על התמונות), בלי עלות. אשר/י והתחל."
            : `ההפקה במנוע ${ENGINE_LABEL[engine]} תעלה עד כ-$${estimate.totalUsd}. אשר/י והתחל.`,
      };

    const format = imageFormatsFrom([project.payload.format], ["9:16"])[0];
    const voiceId =
      typeof args.voice_id === "string" && args.voice_id.trim()
        ? args.voice_id.trim()
        : typeof video.voice_id === "string"
          ? video.voice_id
          : null;
    await supabase
      .from("marketing_work_items")
      .update({
        payload: {
          ...project.payload,
          video: { ...video, scene_engine: engine, sound_engine: "elevenlabs" },
        },
      })
      .eq("id", itemId)
      .eq("tenant_id", tenantId);
    const produced = await supabase.rpc("produce_video", {
      p_item_id: itemId,
      p_aspect: format,
      p_provider: engine,
      p_estimate: {
        clips: estimate.clips,
        voice: estimate.voice,
        music: estimate.music,
      },
      p_stage_id: stageId,
      p_with_voice: withVoice,
      p_with_music: withMusic,
      p_voice_id: voiceId,
      p_music_prompt:
        "Instrumental commercial bed matching the storyboard, no vocals and no lyrics.",
      p_generate_audio: false,
    });
    if (produced.error) return { error: produced.error.message };
    const state = asRecord(produced.data);
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
      status: state.status ?? "running",
      engine: ENGINE_LABEL[engine],
      client_id: clientId,
      message:
        "ההפקה התחילה. הסרט יופיע בלוח כשיהיה מוכן, בדרך כלל תוך דקה או שתיים.",
      artifact,
      workshop: {
        event: "artifacts",
        item_id: itemId,
        artifact_id: artifact.id,
      },
    };
  }

  return { error: "כלי לא מוכר" };
}
