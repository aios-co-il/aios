/** Pure helpers for the Carmen chat inside the Creative studio (no React, no network). */

export type StudioUiActionType =
  | "produce_video"
  | "generate_variations"
  | "single_variation"
  | "revise_variation"
  | "regenerate_frame"
  | "animate_scene"
  | "approve_to_campaigns"
  | "focus_scene"
  | "focus_variation"
  | "open_drawer";

export type StudioDrawer =
  "projects" | "project" | "scene" | "edit" | "versions";

/** What studio_ui_action hands back; the studio runs it with its own button handlers. */
export interface StudioUiAction {
  type: StudioUiActionType;
  item_id: string;
  scene_id?: string;
  variation_id?: string;
  note?: string;
  text_as_layers?: boolean;
  mixed_structure?: boolean;
  drawer?: StudioDrawer;
}

const ACTION_TYPES: StudioUiActionType[] = [
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
];
const DRAWERS: StudioDrawer[] = [
  "projects",
  "project",
  "scene",
  "edit",
  "versions",
];

const str = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

/** Accepts only a well-formed action from the stream; anything else is dropped. */
export function parseUiAction(value: unknown): StudioUiAction | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type as StudioUiActionType;
  const itemId = str(raw.item_id);
  if (!ACTION_TYPES.includes(type) || !itemId) return null;
  const action: StudioUiAction = { type, item_id: itemId };
  if (str(raw.scene_id)) action.scene_id = raw.scene_id as string;
  if (str(raw.variation_id)) action.variation_id = raw.variation_id as string;
  if (str(raw.note)) action.note = raw.note as string;
  if (typeof raw.text_as_layers === "boolean")
    action.text_as_layers = raw.text_as_layers;
  if (typeof raw.mixed_structure === "boolean")
    action.mixed_structure = raw.mixed_structure;
  if (DRAWERS.includes(raw.drawer as StudioDrawer))
    action.drawer = raw.drawer as StudioDrawer;
  if (type === "open_drawer" && !action.drawer) return null;
  return action;
}

/**
 * Paid actions whose studio button has no cost dialog of its own: the chat shows an
 * approval card first. Produce, animate and revise open their own dialogs on screen.
 */
const NEEDS_CHAT_APPROVAL: StudioUiActionType[] = [
  "generate_variations",
  "single_variation",
  "regenerate_frame",
  "approve_to_campaigns",
];

export const needsChatApproval = (action: StudioUiAction) =>
  NEEDS_CHAT_APPROVAL.includes(action.type);

export function uiActionLabel(action: StudioUiAction): string {
  switch (action.type) {
    case "produce_video":
      return "הפקת הסרט";
    case "generate_variations":
      return action.mixed_structure
        ? "וריאציות לכל הקונספטים (מבנים שונים)"
        : "וריאציות לכל הקונספטים";
    case "single_variation":
      return "וריאציה אחת";
    case "revise_variation":
      return "תיקון וריאציה";
    case "regenerate_frame":
      return "פריים חדש לסצנה";
    case "animate_scene":
      return "הנפשת סצנה";
    case "approve_to_campaigns":
      return "אישור והעברה לקמפיינים";
    case "focus_scene":
      return "מעבר לסצנה";
    case "focus_variation":
      return "מעבר לוריאציה";
    case "open_drawer":
      return "פתיחת מגירה";
  }
}

/** The studio's own tools, so the user sees what Carmen is touching. */
const STUDIO_TOOL_LABELS: Record<string, string> = {
  get_studio_state: "בודקת את הפרויקט",
  update_studio_settings: "מעדכנת הגדרות",
  attach_to_project: "מצרפת קובץ לפרויקט",
  edit_scene: "עורכת סצנה",
  add_scene: "מוסיפה סצנה",
  delete_scene: "מוחקת סצנה",
  studio_ui_action: "מפעילה בסטודיו",
  get_video_storyboard: "קוראת את הסטוריבורד",
  render_video_film: "מרכיבה סרט",
};

/** Other tools Carmen often calls from the studio. */
const OTHER_TOOL_LABELS: Record<string, string> = {
  get_carmen_skins: "בודקת את הסקינים שלה",
  recall_skills: "מחפשת בסקילים",
  search_agent_tools: "מחפשת כלי מתאים",
  recall_memory: "בודקת בזיכרון",
  kb_search: "מחפשת במאגר הידע",
  get_client_info: "קוראת על הלקוח",
};

/** The progress line while a tool runs: studio tools by name, any other tool generically. */
export function studioToolLine(tool: unknown): string {
  const name = typeof tool === "string" ? tool : "";
  return STUDIO_TOOL_LABELS[name] ?? OTHER_TOOL_LABELS[name] ?? "כרמן עובדת…";
}

/** With no stream event for this long, the chat stops waiting. */
export const STUDIO_STALL_MS = 120_000;

export const STUDIO_STALL_MESSAGE =
  "כרמן לא ענתה במשך שתי דקות, אז הפסקתי לחכות. נסו לשלוח שוב, או לפצל את הבקשה לצעדים קטנים.";

export interface StudioStreamEvent {
  type: string;
  [key: string]: unknown;
}

/** Splits an SSE buffer into complete `data:` events and the unfinished tail. */
export function parseSseBuffer(buffer: string): {
  events: StudioStreamEvent[];
  rest: string;
} {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: StudioStreamEvent[] = [];
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed.type === "string") events.push(parsed);
    } catch {
      /* a malformed line is skipped; the stream goes on */
    }
  }
  return { events, rest };
}

export interface StudioContext {
  itemId: string;
  title: string;
  mode: "video" | "static";
  /** 1-based scene number currently open in the editor. */
  sceneNumber?: number | null;
  variationName?: string | null;
  sceneCount?: number;
  variationCount?: number;
}

/** The system prompt addon: which project the studio has open and what the user is looking at. */
export function studioContextAddon(context: StudioContext): string {
  const lines = [
    "--- הקשר הסטודיו (מהמסך) ---",
    `item_id: ${context.itemId}`,
    `פרויקט: ${context.title || "ללא שם"}`,
    `סוג: ${context.mode === "video" ? "סרטון" : "פוסט סטטי"}`,
  ];
  if (context.mode === "video") {
    lines.push(`סצנות: ${context.sceneCount ?? 0}`);
    if (context.sceneNumber)
      lines.push(`סצנה פתוחה כרגע: ${context.sceneNumber}`);
  } else {
    lines.push(`וריאציות: ${context.variationCount ?? 0}`);
    if (context.variationName)
      lines.push(`וריאציה מוצגת: ${context.variationName}`);
  }
  lines.push(
    'השתמשי ב-item_id הזה בכל כלי סטודיו. "הסצנה הזו" או "זה" מתייחסים למה שפתוח כרגע.',
  );
  return lines.join("\n");
}

export type ChatPart =
  { kind: "text"; text: string } | { kind: "image"; alt: string; url: string };

/** A Markdown picture with a web link: ![name](https://…). */
const MARKDOWN_IMAGE = /!\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/g;

/** Carmen's answer as text and pictures, so the skin portraits she shows appear as images. */
export function chatParts(text: string): ChatPart[] {
  const parts: ChatPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKDOWN_IMAGE)) {
    const start = match.index ?? 0;
    if (start > last)
      parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({ kind: "image", alt: match[1], url: match[2] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export const fileLine = (name: string, url: string) =>
  `[קובץ שהעליתי: ${name}](${url})`;

export interface StudioTurn {
  message: string;
  tenantId: string;
  clientId: string | null;
  contextAddon: string;
  history: { role: "user" | "assistant"; content: string }[];
  /** The server's conversation for this project's chat, once its first turn started it. */
  conversationId?: string | null;
}

/**
 * The run-ai-agent request for one studio turn. Every turn after the first continues the same
 * conversation, so a yes answers what Carmen offered in it (a dev task is approved only there).
 */
export function studioRunBody(turn: StudioTurn) {
  return {
    command_text: turn.message,
    tenant_id: turn.tenantId,
    client_id: turn.clientId,
    surface: "internal_chat",
    stream: true,
    task_mode: "marketing_creative",
    task_skills: ["creative_studio"],
    system_prompt_addon: turn.contextAddon,
    conversation_history: turn.history,
    user_name: "סטודיו קריאייטיב",
    ...(turn.conversationId ? { conversation_id: turn.conversationId } : {}),
  };
}
