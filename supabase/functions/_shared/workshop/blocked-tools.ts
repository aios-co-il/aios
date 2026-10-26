/** The approval queue's tools: never offered in the workshop chat (a tap there is not an approval). */
const WORKSHOP_BLOCKED_TOOLS = new Set([
  "execute_pending_approval",
  "reject_pending_approval",
  "list_pending_approvals",
]);

export const isBlockedInWorkshop = (toolName: string, inWorkshop: boolean) =>
  inWorkshop && WORKSHOP_BLOCKED_TOOLS.has(toolName);
