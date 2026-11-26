/**
 * Plan rule 9 (AIO-686): once a device result is in a run, a page may be steering the
 * model, so the turn keeps only tools that read. Every other server tool is withheld: not
 * offered, and refused if called anyway. The list is an allowlist on purpose: a tool that
 * writes without approval (save_memory, whose `instructions` reach every later system
 * prompt; create_agent_task; create_* and update_*) is withheld without anyone naming it,
 * and so is every connector tool and every tool added later. A catalogue-wide read flag
 * would replace this list (AIO-656).
 */
import { isDeviceToolName } from "../../_shared/carmen/device/contract.ts";

/**
 * The tools a turn holding page text keeps. Each one only reads (kb_open and
 * kb_recall_conversation also touch an access timestamp); withheld.test.ts checks each is
 * in the catalogue, runs directly and has no approval class.
 */
export const PAGE_TURN_READ_TOOLS: ReadonlyArray<string> = [
  "recall_memory",
  "recall_memory_fts",
  "kb_search",
  "kb_open",
  "kb_list_folder",
  "kb_recall_conversation",
  "list_clients",
  "get_client_info",
  "list_leads",
  "search_entities",
  "list_tasks",
  "get_dashboard_stats",
  "recall_recent_action",
  "list_campaigners",
  "list_sales_people",
];

/** Whether a turn holding page text withholds a server tool: every one but the reads. */
export function withheldAfterPageRead(toolName: string): boolean {
  return (
    !isDeviceToolName(toolName) && !PAGE_TURN_READ_TOOLS.includes(toolName)
  );
}

/** The refusal a withheld tool returns when the model calls it anyway. */
export function withheldToolRefusal(toolName: string) {
  return {
    error: "withheld_after_page_read",
    message: `${toolName} לא זמין בתור הזה: בתור יש תוכן מדף אינטרנט, שעלול להכיל הוראות זדוניות. אפשר לבקש את הפעולה בהודעה חדשה.`,
  };
}
