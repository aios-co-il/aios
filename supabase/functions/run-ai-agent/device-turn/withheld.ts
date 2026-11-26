/**
 * Plan rule 9 (AIO-686): once a device result is in a run, a page may be steering the
 * model, so the server tools that send outward or write are withheld on that turn: not
 * offered, and refused if called anyway. The list is composed of the lists that already
 * name such tools, never retyped: every connector (`mcp_`) tool; every tool a direct caller
 * may not run or needs approval for (`classifyDirectTool`: sends, deletions, access, money,
 * agent spawning, approvals, coding agents); and every tool with an approval risk class
 * (`approvalRiskClass`: ad spend, accounting, broadcasts, configuration).
 *
 * Unverified (plan §7): which other writing tools run without approval today. A tool on
 * none of these lists stays offered.
 */
import { classifyDirectTool } from "../../_shared/carmen-direct-tools.mjs";
import { approvalRiskClass } from "../../_shared/carmen/approvals/risk-classes.ts";
import { isDeviceToolName } from "../../_shared/carmen/device/contract.ts";

/** Whether a server tool sends outward or writes, so a turn holding page text withholds it. */
export function sendsOrWrites(toolName: string): boolean {
  if (isDeviceToolName(toolName)) {
    return false;
  }
  return (
    toolName.startsWith("mcp_") ||
    classifyDirectTool(toolName) !== "direct" ||
    approvalRiskClass({ tool_name: toolName }) !== "unknown"
  );
}

/** The refusal a withheld tool returns when the model calls it anyway. */
export function withheldToolRefusal(toolName: string) {
  return {
    error: "withheld_after_page_read",
    message: `${toolName} לא זמין בתור הזה: בתור יש תוכן מדף אינטרנט, שעלול להכיל הוראות זדוניות. אפשר לבקש את הפעולה בהודעה חדשה.`,
  };
}
