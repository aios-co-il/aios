import { VIDEO_DIRECTOR_TOOLS } from "../../_shared/video-director-tools.ts";
import { CREATIVE_STUDIO_TOOLS } from "../../_shared/creative-studio-tools.ts";
import { PULSE_TARGET_TOOLS } from "../../_shared/carmen/pulse-targets/tool-defs.ts";
import { CARD_DRAFT_TOOLS } from "../card-draft-approval/tool.ts";

export const marketingTools = [
  // Marketing department (Copy / Creative / SEO pipeline)
  ...VIDEO_DIRECTOR_TOOLS,
  ...CREATIVE_STUDIO_TOOLS,
  ...PULSE_TARGET_TOOLS,
  ...CARD_DRAFT_TOOLS,
  {
    name: "list_marketing_work_items",
    description:
      "רשימת עבודות במחלקת השיווק (קופי/קריאייטיב/SEO). אפשר לסנן לפי לקוח, מחלקה או סטטוס.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        department: { type: "string", enum: ["copy", "creative", "seo"] },
        status: { type: "string" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "get_marketing_work_item",
    description: "פרטי עבודת שיווק כולל payload ושלב נוכחי.",
    parameters: {
      type: "object",
      properties: { item_id: { type: "string" } },
      required: ["item_id"],
    },
  },
  {
    name: "create_marketing_work_item",
    description:
      "יצירת בריף/עבודה חדשה במחלקת שיווק (copy/creative/seo). יוצר pipeline ללקוח אם חסר וממקם בשלב המתאים.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        title: { type: "string" },
        brief: { type: "string", description: "בריף / חומר גלם" },
        department: {
          type: "string",
          enum: ["copy", "creative", "seo"],
          description: "ברירת מחדל copy",
        },
        content_type: { type: "string" },
        channel: { type: "string" },
        instructions: { type: "string" },
      },
      required: ["client_id", "title", "brief"],
    },
  },
  {
    name: "handoff_marketing_work_item",
    description:
      "העברת עבודת שיווק לשלב הבא בפייפליין (למשל מ-copy ל-creative, מ-creative ל-target_paid).",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        to_stage_type: {
          type: "string",
          enum: [
            "strategy",
            "copy",
            "creative",
            "target_paid",
            "target_seo",
            "target_organic",
            "measurement",
          ],
        },
      },
      required: ["item_id", "to_stage_type"],
    },
  },
  {
    name: "update_marketing_work_item",
    description: "עדכון כותרת/סטטוס/payload של עבודת שיווק.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        title: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "in_progress", "review", "approved", "archived"],
        },
        payload_patch: {
          type: "object",
          description: "מיזוג לתוך payload הקיים",
        },
      },
      required: ["item_id"],
    },
  },
];
