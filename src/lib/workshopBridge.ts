/**
 * The link between the workshop board and Carmen's session chat. They sit in different parts
 * of the page, so they share this small store: the board says which project and page is open,
 * the chat sends that to Carmen, and Carmen's tool events come back to the board.
 */

export interface WorkshopContext {
  projectId: string | null;
  title: string | null;
  selectedArtifactId: string | null;
  /** The client in view (?client=<id>); null for all clients or general content. */
  clientId: string | null;
  clientName?: string | null;
}

export interface WorkshopEvent {
  event: "project" | "artifacts";
  item_id: string;
  artifact_id?: string;
}

let context: WorkshopContext | null = null;
const contextListeners = new Set<() => void>();
const eventListeners = new Set<(event: WorkshopEvent) => void>();

export const getWorkshopContext = () => context;

export function setWorkshopContext(next: WorkshopContext | null) {
  context = next;
  contextListeners.forEach((listener) => listener());
}

export function subscribeWorkshopContext(listener: () => void) {
  contextListeners.add(listener);
  return () => {
    contextListeners.delete(listener);
  };
}

export function emitWorkshopEvent(event: WorkshopEvent) {
  eventListeners.forEach((listener) => listener(event));
}

export function subscribeWorkshopEvents(
  listener: (event: WorkshopEvent) => void,
) {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

/** A stream event from the agent, when it is one the board cares about. */
export function workshopEventFrom(parsed: unknown): WorkshopEvent | null {
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  if (row.type !== "workshop") return null;
  if (row.event !== "project" && row.event !== "artifacts") return null;
  if (typeof row.item_id !== "string" || !row.item_id) return null;
  return {
    event: row.event,
    item_id: row.item_id,
    artifact_id:
      typeof row.artifact_id === "string" ? row.artifact_id : undefined,
  };
}

export const WORKSHOP_SKIN = "carmen_workshop";

/** What the chat adds to a Carmen request while the workshop is open. */
export function workshopRequestParts(ctx: WorkshopContext | null) {
  if (!ctx) return null;
  const lines = [
    "=== הסדנה של כרמן ===",
    "המשתמש בלוח הסדנה ורואה כל מה שאת מפיקה.",
    ctx.projectId
      ? `פרויקט פתוח: item_id=${ctx.projectId}${ctx.title ? ` (${ctx.title})` : ""}. עבדי עליו, ואל תפתחי פרויקט חדש אלא אם ביקשו.`
      : "אין פרויקט פתוח. בקשת עבודה חדשה (מודעה, סרטון, קופי...) פותחת פרויקט עם workshop_start_project. שאלה עלייך או על המערכת מקבלת תשובה ישירה, בלי פרויקט.",
  ];
  if (ctx.selectedArtifactId)
    lines.push(
      `העמוד שהמשתמש בחר בלוח: artifact_id=${ctx.selectedArtifactId}. "את זה" ו"שני את זה" מתייחסים אליו.`,
    );
  if (ctx.clientId)
    lines.push(
      `הלקוח הפתוח בסדנה: client_id=${ctx.clientId}${ctx.clientName ? ` (${ctx.clientName})` : ""}. פרויקט חדש נפתח עבורו אלא אם ביקשו לקוח אחר.`,
    );
  return {
    taskSkills: [WORKSHOP_SKIN],
    promptAddon: lines.join("\n"),
    workshopItemId: ctx.projectId,
    workshopClientId: ctx.clientId,
  };
}

const TOOL_LABELS: Record<string, string> = {
  workshop_start_project: "פותחת פרויקט",
  workshop_get_state: "בודקת מה כבר יש בפרויקט",
  workshop_make_creative: "יוצרת תמונות",
  workshop_save_concepts: "כותבת קונספטים",
  workshop_save_copy: "כותבת קופי",
  workshop_storyboard: "כותבת סטוריבורד",
  workshop_make_stills: "יוצרת תמונות לסצנות",
  workshop_produce_video: "מפיקה את הסרט",
  workshop_assign_client: "משייכת ללקוח",
  workshop_check_connections: "בודקת אילו מפתחות מחוברים",
  workshop_inspect_site: "קוראת את האתר",
  workshop_add_assets: "מוסיפה נכסים לפרויקט",
};

/** The line shown in the chat while a workshop tool runs; other tools keep their own name. */
export const workshopToolLabel = (tool: string | undefined) =>
  tool ? (TOOL_LABELS[tool] ?? tool) : tool;
