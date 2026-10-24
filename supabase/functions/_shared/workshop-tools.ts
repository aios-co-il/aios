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
import { PROVIDER_LABEL, capabilityReport } from "./workshop/capabilities.ts";
import { briefingGate } from "./workshop/briefing.ts";
import { productionReport } from "./workshop/production.ts";
import {
  ASSET_BUCKET,
  assetForCarmen,
  hostLabel,
  isHttpUrl,
  syncClientAssets,
  type AssetView,
} from "./workshop/assets.ts";
import {
  describeSite,
  siteReport,
  withStylesheets,
} from "./workshop/site-report.ts";
import {
  normalizeEngine,
  type ImageProvider,
} from "./workshop/image-providers.ts";
import { lookOf, stillPrompt, withLook } from "./workshop/look.ts";
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
    name: "workshop_check_connections",
    description:
      "בודקת אילו מפתחות מחוברים לדייר (OpenAI, Google, Anthropic, ElevenLabs, Higgsfield) ומה אפשר ליצור איתם: תמונות, סרטון, קריינות, מוזיקה. קראי לזה לפני שאת אומרת שאי אפשר ליצור משהו בגלל מפתח, ואחרי שגיאת מפתח. לא מחזירה את ערכי המפתחות. לא עולה כסף.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "workshop_inspect_site",
    description:
      "קוראת אתר קיים (בדרך כלל האתר של הלקוח) ומחזירה איך הוא נראה ונשמע: צבעי מותג, גופנים, כותרות, דוגמאות קופי וסגנון כתיבה, לוגו ותמונות מהאתר. בלי url היא קוראת את האתר של הלקוח או את נכס האתר של הפרויקט. הדוח נשמר בלשונית הנכסים. apply_brand=true שומר את הצבעים, הגופנים והלוגו כספר המותג של הפרויקט. לא עולה כסף. תמונה מהאתר שמגדירה את הסגנון שמרי עם workshop_add_assets.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט" },
        url: {
          type: "string",
          description: "כתובת האתר או עמוד בו; אפשר להשמיט כשיש אתר ללקוח",
        },
        apply_brand: {
          type: "boolean",
          description: "לשמור צבעים, גופנים ולוגו כספר המותג של הפרויקט",
        },
      },
      required: ["item_id"],
    },
  },
  {
    name: "workshop_add_assets",
    description:
      "מוסיפה נכסים ללשונית הנכסים של הפרויקט: תמונות (גם מהאתר של הלקוח, והן נשמרות אצלנו), קישורים ובריפים בטקסט. use_as_reference=true לתמונה שהיצירות צריכות ללכת לפי הסגנון שלה (עד ארבע בפרויקט). לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט" },
        assets: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["image", "link", "text"],
                description:
                  "image: תמונה בקישור; link: קישור; text: בריף בטקסט",
              },
              url: { type: "string" },
              text: { type: "string", description: "תוכן בריף לסוג text" },
              title: { type: "string" },
              use_as_reference: { type: "boolean" },
            },
            required: ["kind"],
          },
        },
      },
      required: ["item_id", "assets"],
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
            "תיאור מפורט של הוויזואל באנגלית: נושא, סגנון, תאורה, קומפוזיציה. בלי טקסט על התמונה, אלא אם המשתמש ביקש טקסט: אז כותבים בתיאור בדיוק מה מופיע ואיפה, והמילים עצמן בתוך גרשיים כפולים בדיוק כמו שהמשתמש כתב (גם בעברית), קצר ככל האפשר.",
        },
        formats: {
          type: "array",
          items: { type: "string", enum: ["9:16", "4:5", "1:1", "16:9"] },
          description: "ברירת מחדל: הפורמטים של הפרויקט",
        },
        engine: {
          type: "string",
          enum: ["google", "elevenlabs", "higgsfield", "openai"],
          description:
            "מנוע התמונות שהמשתמש בחר. כשמחוברים כמה, הכלי מחזיר את האפשרויות ושואלים אותו. הבחירה נשמרת לפרויקט.",
        },
        reference_urls: {
          type: "array",
          items: { type: "string" },
          description:
            "קישורי https של תמונות רפרנס שהמשתמש צירף או נתן (עד 4). חובה להעביר אותם כשיש: כל התמונות נוצרות לפיהן. נשמרים לפרויקט.",
        },
        style_approved: {
          type: "boolean",
          description:
            "true רק אחרי שהמשתמש אישר את הסגנון (style_bible) בהודעה שלו. בלי זה הכלי יחזיר שאלות במקום לייצר.",
        },
        style_bible: {
          type: "string",
          description:
            "באנגלית, 3 עד 6 משפטים שמחזיקים את אותו מראה בכל הפרויקט: הדמות (גיל, פנים, שיער, מבנה, לבוש), המקום, פלטת צבעים, תאורה וסגנון רינדור. נשמר לפרויקט ומצורף לכל תמונה.",
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
        engine: {
          type: "string",
          enum: ["google", "elevenlabs", "higgsfield", "openai"],
          description:
            "מנוע התמונות שהמשתמש בחר. כשמחוברים כמה, הכלי מחזיר את האפשרויות ושואלים אותו. הבחירה נשמרת לפרויקט.",
        },
        reference_urls: {
          type: "array",
          items: { type: "string" },
          description:
            "קישורי https של תמונות רפרנס שהמשתמש צירף או נתן (עד 4). חובה להעביר אותם כשיש: כל התמונות נוצרות לפיהן. נשמרים לפרויקט.",
        },
        style_approved: {
          type: "boolean",
          description:
            "true רק אחרי שהמשתמש אישר את הסגנון (style_bible) בהודעה שלו. בלי זה הכלי יחזיר שאלות במקום לייצר.",
        },
        style_bible: {
          type: "string",
          description:
            "באנגלית, 3 עד 6 משפטים שמחזיקים את אותו מראה בכל הפרויקט: הדמות (גיל, פנים, שיער, מבנה, לבוש), המקום, פלטת צבעים, תאורה וסגנון רינדור. נשמר לפרויקט ומצורף לכל תמונה.",
        },
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
      "יוצרת תמונה לכל סצנה שעדיין בלי תמונה (עד 10 בקריאה; אם נשארו, קראי שוב). התמונות נוצרות לפי הרפרנסים וה-style_bible של הפרויקט, והתמונה הראשונה נקבעת כעוגן שכל השאר נוצרות לפיו, כדי לשמור על אותה דמות ואותו סגנון. עולה כסף: confirmed=false מחזיר עלות, ורק אחרי שהמשתמש אישר בהודעה שלו קראי עם confirmed=true.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        confirmed: { type: "boolean" },
        redo: {
          type: "boolean",
          description:
            "true כשהמשתמש רוצה ליצור מחדש את כל תמונות הסצנות (למשל כשלא תאמו את הרפרנס או לא היו אחידות). עולה כסף, דורש אישור.",
        },
        engine: {
          type: "string",
          enum: ["google", "elevenlabs", "higgsfield", "openai"],
          description:
            "מנוע התמונות שהמשתמש בחר. כשמחוברים כמה, הכלי מחזיר את האפשרויות ושואלים אותו. הבחירה נשמרת לפרויקט.",
        },
        reference_urls: {
          type: "array",
          items: { type: "string" },
          description:
            "קישורי https של תמונות רפרנס שהמשתמש צירף או נתן (עד 4). חובה להעביר אותם כשיש: כל התמונות נוצרות לפיהן. נשמרים לפרויקט.",
        },
        style_approved: {
          type: "boolean",
          description:
            "true רק אחרי שהמשתמש אישר את הסגנון (style_bible) בהודעה שלו. בלי זה הכלי יחזיר שאלות במקום לייצר.",
        },
        style_bible: {
          type: "string",
          description:
            "באנגלית, 3 עד 6 משפטים שמחזיקים את אותו מראה בכל הפרויקט: הדמות (גיל, פנים, שיער, מבנה, לבוש), המקום, פלטת צבעים, תאורה וסגנון רינדור. נשמר לפרויקט ומצורף לכל תמונה.",
        },
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
const STILL_CONCURRENCY = 5;
/** A pending picture page younger than this means its generation is still running. */
const RUNNING_WINDOW_MS = 4 * 60_000;
/** The edge function has a hard time limit: no new batch of pictures starts after this. */
const STILLS_BUDGET_MS = 50_000;

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

const PAGE_COLUMNS = "id, kind, title, folder, status, url, thumb_url";

/**
 * While pictures are being made the board shows a pending page per picture. It comes from the
 * database, so it appears whether or not the chat stream reaches the screen, and each pending
 * page is turned into the finished one (an update, which the live board always receives).
 * Cosmetic: any failure here must never stop the work itself.
 */
async function openPlaceholders(
  supabase: Db,
  tenantId: string,
  itemId: string,
  rows: { kind: "image" | "scene_still"; title: string; meta?: object }[],
): Promise<(string | undefined)[]> {
  const none = rows.map(() => undefined);
  try {
    await supabase
      .from("workshop_artifacts")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("status", "pending")
      .eq("meta->>placeholder", "true");
    const { data, error } = await supabase
      .from("workshop_artifacts")
      .insert(
        rows.map((row) =>
          artifactRow({
            tenantId,
            itemId,
            kind: row.kind,
            title: row.title,
            status: "pending",
            meta: { ...row.meta, placeholder: true },
          }),
        ),
      )
      .select("id");
    if (error || !Array.isArray(data)) return none;
    return rows.map((_, index) => data[index]?.id);
  } catch {
    return none;
  }
}

async function settlePlaceholder(
  supabase: Db,
  tenantId: string,
  id: string | undefined,
  patch: Record<string, unknown>,
) {
  if (!id) return null;
  try {
    const { data } = await supabase
      .from("workshop_artifacts")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(PAGE_COLUMNS)
      .maybeSingle();
    return (data ?? null) as Record<string, any> | null;
  } catch {
    return null;
  }
}

const failedPatch = (error: string) => ({
  status: "failed",
  meta: { text: error.slice(0, 300) },
});

/**
 * A scene picture always gets its page on the board. The database trigger usually does it; this
 * covers projects it skips and keeps the board right if the trigger ever fails.
 */
async function ensureStillPage(
  supabase: Db,
  tenantId: string,
  itemId: string,
  scene: Record<string, any>,
  asset: unknown,
  url: string,
  placeholderId?: string,
) {
  const assetId = asRecord(Array.isArray(asset) ? asset[0] : asset).id;
  if (typeof assetId !== "string") return;
  const { data: existing } = await supabase
    .from("workshop_artifacts")
    .select("id")
    .eq("ref_table", "marketing_assets")
    .eq("ref_id", assetId)
    .maybeSingle();
  if (existing) return;
  const settled = await settlePlaceholder(supabase, tenantId, placeholderId, {
    status: "ready",
    url,
    thumb_url: url,
    ref_table: "marketing_assets",
    ref_id: assetId,
    meta: { asset_id: assetId },
  });
  if (settled) return;
  await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "scene_still",
    title: `סצנה ${scene.position}${scene.title ? ` · ${scene.title}` : ""}`,
    url,
    refTable: "marketing_assets",
    refId: assetId,
    meta: { asset_id: assetId },
  });
}

/** What the edge function injects so this module stays free of Deno and provider code. */
export interface WorkshopDeps {
  generateImage?: (
    prompt: string,
    format: Format,
    references?: string[],
    engine?: ImageProvider,
  ) => Promise<{ image_url?: string; error?: string }>;
  /** Image engines the tenant has keys for; more than one means the user chooses. */
  imageEngines?: () => Promise<ImageProvider[]>;
  defaultEngine?: () => Promise<SceneEngine>;
  envOpenAiKey?: string;
  /** Keeps work running after the chat reply is sent (the edge runtime's waitUntil). */
  background?: (work: Promise<unknown>) => void;
  /** Reads a public web page or file; the edge function supplies the address-pinned version. */
  fetchPublic?: (
    url: string,
    options?: { maxBytes?: number; accept?: string },
  ) => Promise<{
    ok: boolean;
    url: string;
    contentType: string;
    bytes: Uint8Array;
    error?: string;
  }>;
  /** Copies a picture from the web into our storage; returns its public link. */
  importImage?: (
    url: string,
    scope: { tenantId: string; itemId: string },
  ) => Promise<{ url?: string; path?: string; error?: string }>;
}

async function savePayload(
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
async function briefProject(
  deps: WorkshopDeps,
  payload: Record<string, unknown>,
  args: Record<string, unknown>,
  options: { kind: "video" | "static"; needsEngine: boolean },
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
  const folded = withLook(payload, { ...args, engine: asked });
  const look = lookOf(folded.payload);
  const gate = briefingGate({
    look,
    styleApproved: args.style_approved === true || stored.bible.length > 0,
    connected,
    engine: chosen,
    kind: options.kind,
    needsEngine: options.needsEngine,
  });
  if (gate) return { gate: gate as unknown as Record<string, unknown> };
  return {
    payload: folded.payload,
    engine: chosen ?? (connected?.length === 1 ? connected[0] : null),
  };
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

const publicUrlOf = (supabase: Db) => (path: string) =>
  supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data
    .publicUrl as string;

const ASSET_COLUMNS =
  "id, asset_type, source, title, url, storage_path, text, use_as_reference, meta, created_at";

async function loadAssets(
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
async function mirrorReferences(
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
    let clientAssets = 0;
    if (clientId) {
      const synced = await syncClientAssets(
        supabase,
        { tenantId, itemId, clientId },
        publicUrlOf(supabase),
      );
      clientAssets = synced.added;
    }
    return {
      success: true,
      item_id: itemId,
      title: plan.title,
      client_assets: clientAssets,
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

  if (name === "workshop_check_connections") {
    const { data, error } = await supabase
      .from("tenant_integrations")
      .select("settings")
      .eq("tenant_id", tenantId)
      .eq("integration_type", "llm")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { error: error.message };
    const report = capabilityReport(
      (data?.settings ?? {}) as Record<string, unknown>,
      { openai: deps.envOpenAiKey },
    );
    return {
      success: true,
      ...report,
      message:
        report.missing.length === 0
          ? "הכול מחובר: אפשר ליצור תמונות, סרטון, קריינות ומוזיקה."
          : `מה שחסר: ${report.missing.join("; ")}.`,
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
    const synced = await syncClientAssets(
      supabase,
      { tenantId, itemId, clientId: wanted },
      publicUrlOf(supabase),
    );
    return {
      success: true,
      item_id: itemId,
      client_id: wanted,
      client_assets: synced.added,
      message: wanted
        ? synced.added > 0
          ? `הפרויקט שויך ללקוח, ונכנסו ללשונית הנכסים ${synced.added} נכסים שלו (בריף, אתר, קבצים).`
          : "הפרויקט שויך ללקוח. אין ללקוח בריף, אתר או קבצים להעביר."
        : "השיוך ללקוח הוסר. הפרויקט נשאר בלי לקוח.",
      workshop: { event: "artifacts", item_id: itemId },
    };
  }

  if (name === "workshop_inspect_site") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    if (!deps.fetchPublic) return { error: "קריאת אתרים לא זמינה כאן" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const { project } = loaded;
    const assets = await loadAssets(supabase, tenantId, itemId);
    let wanted = String(args.url ?? "").trim();
    if (!wanted) {
      wanted =
        assets.find((a) => a.asset_type === "site" && a.url)?.url ??
        (typeof project.payload.client_website === "string"
          ? project.payload.client_website
          : "");
    }
    if (!wanted && project.client_id) {
      const client = await supabase
        .from("clients")
        .select("website")
        .eq("id", project.client_id)
        .maybeSingle();
      wanted = String(client.data?.website ?? "").trim();
    }
    if (!wanted)
      return {
        error:
          "אין כתובת אתר. בקשי מהמשתמש את הכתובת, או שייכי את הפרויקט ללקוח שיש לו אתר.",
      };
    const target = isHttpUrl(wanted) ? wanted : `https://${wanted}`;
    const page = await deps.fetchPublic(target, { maxBytes: 1_500_000 });
    if (!page.ok)
      return {
        error: `לא הצלחתי לקרוא את האתר: ${page.error ?? "אין תשובה"}. אפשר לבקש מהמשתמש להעלות לוגו ותמונות ידנית.`,
      };
    const html = new TextDecoder().decode(page.bytes);
    let report = siteReport(html, page.url || target);
    const styles = await Promise.all(
      report.stylesheets.slice(0, 2).map(async (sheet) => {
        const fetched = await deps.fetchPublic!(sheet, {
          maxBytes: 400_000,
          accept: "text/css,*/*",
        });
        return fetched.ok ? new TextDecoder().decode(fetched.bytes) : "";
      }),
    );
    report = withStylesheets(report, styles.filter(Boolean));
    const summary = describeSite(report);
    const existing = assets.find(
      (a) =>
        a.asset_type === "site" && (a.url === report.url || a.url === target),
    );
    const meta = {
      ...(existing?.meta ?? {}),
      inspected_at: new Date().toISOString(),
      report: {
        colors: report.colors,
        fonts: report.fonts,
        headings: report.headings,
        copy: report.copy,
        buttons: report.buttons,
        logo: report.logo,
        images: report.images,
        social: report.social,
      },
    };
    if (existing) {
      await supabase
        .from("workshop_assets")
        .update({ text: summary, meta })
        .eq("id", existing.id);
    } else {
      await supabase.from("workshop_assets").insert({
        tenant_id: tenantId,
        item_id: itemId,
        asset_type: "site",
        source: "carmen",
        title: `האתר · ${hostLabel(report.url)}`,
        url: report.url,
        text: summary,
        meta,
      });
    }
    let applied = false;
    const brand = asRecord(project.payload.brand_book);
    const nextPayload: Record<string, unknown> = { ...project.payload };
    if (
      typeof nextPayload.client_website !== "string" ||
      !nextPayload.client_website
    )
      nextPayload.client_website = report.url;
    if (args.apply_brand === true) {
      nextPayload.brand_book = {
        ...brand,
        colors: report.colors.length > 0 ? report.colors : (brand.colors ?? []),
        fonts: report.fonts.length > 0 ? report.fonts : brand.fonts,
        notes: String(brand.notes ?? "") || summary.slice(0, 600),
        source: "auto",
      };
      if (report.logo && !nextPayload.logo_url)
        nextPayload.logo_url = report.logo;
      applied = true;
    }
    if (
      applied ||
      nextPayload.client_website !== project.payload.client_website
    )
      await savePayload(supabase, tenantId, itemId, nextPayload);
    return {
      success: true,
      url: report.url,
      title: report.title,
      description: report.description,
      language: report.lang || undefined,
      colors: report.colors,
      fonts: report.fonts,
      headings: report.headings,
      copy_samples: report.copy,
      buttons: report.buttons,
      logo: report.logo,
      images: report.images.slice(0, 8),
      brand_applied: applied,
      message:
        "קראתי את האתר ושמרתי את הדוח בלשונית הנכסים. הציגי למשתמש במשפט אחד מה מצאת (צבעים, סגנון כתיבה) והציעי להשתמש בזה. תמונה מהאתר שמרי עם workshop_add_assets.",
      workshop: { event: "artifacts", item_id: itemId },
    };
  }

  if (name === "workshop_add_assets") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const requested = (Array.isArray(args.assets) ? args.assets : []).slice(
      0,
      8,
    );
    if (requested.length === 0) return { error: "assets נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const existing = await loadAssets(supabase, tenantId, itemId);
    const byUrl = new Map(existing.map((a) => [a.url, a]));
    const added: { title: string; type: string }[] = [];
    const failed: { url?: string; reason: string }[] = [];
    let referenceCount = existing.filter(
      (a) => a.asset_type === "image" && a.use_as_reference,
    ).length;
    for (const entry of requested) {
      const item = asRecord(entry);
      const kind = String(item.kind ?? "");
      const title = String(item.title ?? "")
        .trim()
        .slice(0, 120);
      const url = String(item.url ?? "").trim();
      let wantsReference = item.use_as_reference === true;
      if (kind === "text") {
        const text = String(item.text ?? "")
          .trim()
          .slice(0, 8000);
        if (!text) {
          failed.push({ reason: "טקסט ריק" });
          continue;
        }
        await supabase.from("workshop_assets").insert({
          tenant_id: tenantId,
          item_id: itemId,
          asset_type: "text",
          source: "carmen",
          title: title || "בריף",
          text,
        });
        added.push({ title: title || "בריף", type: "text" });
        continue;
      }
      if (!isHttpUrl(url)) {
        failed.push({ url, reason: "הקישור לא תקין" });
        continue;
      }
      if (kind === "link") {
        if (!byUrl.has(url)) {
          await supabase.from("workshop_assets").insert({
            tenant_id: tenantId,
            item_id: itemId,
            asset_type: "link",
            source: "carmen",
            title: title || hostLabel(url),
            url,
          });
          added.push({ title: title || hostLabel(url), type: "link" });
        }
        continue;
      }
      if (kind !== "image") {
        failed.push({ url, reason: "סוג לא מוכר" });
        continue;
      }
      if (wantsReference && referenceCount >= 4) {
        wantsReference = false;
      }
      const known = byUrl.get(url);
      if (known) {
        if (wantsReference && !known.use_as_reference) {
          await supabase
            .from("workshop_assets")
            .update({ use_as_reference: true })
            .eq("id", known.id);
          referenceCount += 1;
        }
        continue;
      }
      if (!deps.importImage) {
        failed.push({ url, reason: "ייבוא תמונות לא זמין כאן" });
        continue;
      }
      const imported = await deps.importImage(url, { tenantId, itemId });
      if (!imported.url) {
        failed.push({ url, reason: imported.error ?? "התמונה לא נקראה" });
        continue;
      }
      await supabase.from("workshop_assets").insert({
        tenant_id: tenantId,
        item_id: itemId,
        asset_type: "image",
        source: "carmen",
        title: title || hostLabel(url),
        url: imported.url,
        storage_path: imported.path ?? null,
        use_as_reference: wantsReference,
        meta: { imported_from: url },
      });
      if (wantsReference) referenceCount += 1;
      added.push({ title: title || hostLabel(url), type: "image" });
    }
    return {
      success: failed.length < requested.length,
      added,
      failed,
      message:
        added.length > 0
          ? `נוספו ${added.length} נכסים ללשונית הנכסים.${failed.length > 0 ? ` ${failed.length} לא נקלטו.` : ""}`
          : "לא נוסף שום נכס. אמרי למשתמש למה בפשטות.",
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
    const [artifacts, running, item, assets] = await Promise.all([
      supabase
        .from("workshop_artifacts")
        .select("id, kind, title, folder, status, meta")
        .eq("item_id", itemId)
        .eq("tenant_id", tenantId)
        .order("created_at"),
      supabase
        .from("marketing_runs")
        .select("kind, status, error, created_at")
        .eq("item_id", itemId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("marketing_work_items")
        .select("payload, client_id")
        .eq("id", itemId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      loadAssets(supabase, tenantId, itemId),
    ]);
    const clientRow = item.data?.client_id
      ? (
          await supabase
            .from("clients")
            .select("id, name, website")
            .eq("id", item.data.client_id)
            .maybeSingle()
        ).data
      : null;
    const runs = (Array.isArray(running.data) ? running.data : []) as {
      kind: string;
      status: string;
      error?: string | null;
      created_at?: string | null;
    }[];
    const itemPayload = asRecord(item.data?.payload);
    return {
      ...studio,
      artifacts: (Array.isArray(artifacts.data) ? artifacts.data : []).map(
        (page: Record<string, any>) => {
          const { meta, ...rest } = page;
          const reason = asRecord(meta).text;
          return page.status === "failed" && typeof reason === "string"
            ? { ...rest, error: reason }
            : rest;
        },
      ),
      running: runs.filter(
        (run) => run.status === "queued" || run.status === "running",
      ),
      production: productionReport(
        runs,
        asRecord(asRecord(itemPayload.video).production),
      ),
      plan: asRecord(itemPayload.workshop),
      brief: String(itemPayload.brief_text ?? "").slice(0, 3000),
      look: {
        references: lookOf(itemPayload).references.length,
        style_written: lookOf(itemPayload).bible.length > 0,
        engine: lookOf(itemPayload).engine,
      },
      client: clientRow
        ? { id: clientRow.id, name: clientRow.name, website: clientRow.website }
        : null,
      assets: assets.slice(0, 30).map(assetForCarmen),
    };
  }

  if (name === "workshop_make_creative") {
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
    if (
      project.payload.project_type === "video" &&
      args.formats === undefined
    ) {
      const scenes = await loadScenes(supabase, tenantId, itemId);
      if (scenes.some((scene) => !scene.still_asset_id))
        return {
          error:
            "זה פרויקט סרט עם סצנות שעוד אין להן תמונה. תמונות לסצנות נוצרות עם workshop_make_stills (confirmed=false קודם), לא עם workshop_make_creative. אם המשתמש ביקש במפורש תמונת מודעה נפרדת, קראי שוב עם formats.",
        };
    }
    const brief = await briefProject(deps, project.payload, args, {
      kind: "static",
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
    if (args.confirmed !== true) {
      return {
        needs_approval: true,
        formats,
        images: estimate.images,
        estimated_usd: estimate.usd,
        message: `הפקה של ${estimate.images} תמונות (${formats.join(", ")}) תעלה עד כ-$${estimate.usd}. אשר/י והתחל.`,
      };
    }
    const running = await supabase
      .from("workshop_artifacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("status", "pending")
      .eq("kind", "image")
      .eq("meta->>placeholder", "true")
      .gte(
        "created_at",
        new Date(Date.now() - RUNNING_WINDOW_MS).toISOString(),
      );
    if (Array.isArray(running.data) && running.data.length > 0)
      return {
        success: true,
        already_running: true,
        message:
          "התמונות כבר בהכנה והן מופיעות בלוח לבד. אל תקראי שוב. לעדכון קראי ל-workshop_get_state.",
      };
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
    const generate = () =>
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
    const brief = await briefProject(deps, project.payload, args, {
      kind: "video",
      needsEngine: false,
    });
    if ("gate" in brief) return brief.gate;
    await mirrorReferences(supabase, tenantId, itemId, args.reference_urls);
    project.payload = brief.payload;
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
    const folded = withLook(project.payload, {}, { anchorUrl: null });
    await savePayload(supabase, tenantId, itemId, {
      ...folded.payload,
      project_type: "video",
    });
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
    const redo = args.redo === true;
    const pending = redo
      ? scenes
      : scenes.filter((scene) => !scene.still_asset_id);
    if (pending.length === 0)
      return { success: true, created: 0, remaining: 0 };
    const brief = await briefProject(deps, project.payload, args, {
      kind: "video",
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
    if (args.confirmed !== true)
      return {
        needs_approval: true,
        scenes: batch.length,
        remaining_after: pending.length - batch.length,
        estimated_usd: estimate.usd,
        message: `${batch.length} תמונות לסצנות יעלו עד כ-$${estimate.usd}. אשר/י והתחל.`,
      };
    let payload = brief.payload;
    if (redo) {
      payload = withLook(payload, {}, { anchorUrl: null }).payload;
      const cleared = await supabase
        .from("marketing_video_scenes")
        .update({ still_asset_id: null })
        .eq("tenant_id", tenantId)
        .eq("item_id", itemId);
      if (cleared.error) return { error: cleared.error.message };
    }
    if (payload !== project.payload)
      await savePayload(supabase, tenantId, itemId, payload);
    const look = lookOf(payload);
    let anchorUrl = look.anchorUrl;

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
        await savePayload(
          supabase,
          tenantId,
          itemId,
          withLook(payload, {}, { anchorUrl }).payload,
        );
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
                ? `נשארו ${remaining} סצנות בלי תמונה: קראי שוב ל-workshop_make_stills עם confirmed=true להמשך, בלי redo (האישור כבר ניתן).`
                : "לכל הסצנות יש תמונה: הציעי להמשיך להפקת הסרט."
            }`,
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
    const alreadyRunning =
      state.status === "running" &&
      Number(state.clips ?? 0) + Number(state.voices ?? 0) === 0 &&
      Number(state.music ?? 0) === 0;
    const open = alreadyRunning
      ? await supabase
          .from("workshop_artifacts")
          .select(PAGE_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("item_id", itemId)
          .eq("kind", "film")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null;
    if (alreadyRunning && open?.data)
      return {
        success: true,
        status: "running",
        already_running: true,
        engine: ENGINE_LABEL[engine],
        client_id: clientId,
        message:
          "הפקה כבר רצה לפרויקט הזה ולא הותחלה שנייה. לבדוק את המצב: workshop_get_state (production), ולא להפיק שוב.",
        artifact: open.data,
      };
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
        "ההפקה התחילה ורצה ברקע בשרת ההפקה. הסרט יופיע בלוח כשיהיה מוכן. אל תפיקי שוב: לבדיקה קראי ל-workshop_get_state ובדקי production.",
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
