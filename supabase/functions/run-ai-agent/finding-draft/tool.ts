/**
 * Carmen's confirm_finding_draft tool (AIO-253): a staff member replies
 * "תעדי <code>" to an item Carmen sent about an unlogged call or meeting,
 * and the drafted entry is logged on the client card in their name. Wired
 * into run-ai-agent with one import, one spread and one dispatch block.
 */
import { parseConfirmDraftReply } from "../../_shared/manager-round/contact-draft.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { type ConfirmInput, confirmFindingDraft } from "./confirm.ts";
import { findingDraftPorts } from "./store.ts";

const TOOL_NAME = "confirm_finding_draft";

export const FINDING_DRAFT_TOOLS = [
  {
    name: TOOL_NAME,
    description:
      'תיעוד שיחה או פגישה שכרמן זיהתה ולא תועדה בכרטיס הלקוח. להפעיל כשאיש צוות עונה "תעדי <מספר>" (או "תעד #<מספר>") על פריט שכרמן שלחה. רושם בכרטיס את הטיוטה שבפריט, או את הנוסח שאיש הצוות כתב, על שמו, ונספר כקשר עם הלקוח. מותר רק למי שהפריט שלו או למנהל; לאחרים הכלי מסרב.',
    parameters: {
      type: "object",
      properties: {
        short_code: {
          type: "integer",
          description: "מספר הפריט מההודעה של כרמן, בלי #",
        },
        content: {
          type: "string",
          description: "נוסח משלו לתיעוד, רק אם איש הצוות כתב כזה",
        },
      },
      required: ["short_code"],
    },
  },
];

/** True for this module's tool. */
export function isFindingDraftTool(name: string): boolean {
  return name === TOOL_NAME;
}

/** Runs the tool over the service-role client of the run. */
export function executeFindingDraftTool(
  db: DbClient,
  input: ConfirmInput,
): Promise<Record<string, unknown>> {
  return confirmFindingDraft(findingDraftPorts(db), input);
}

/** Offers the tool to the model whenever the message is a "תעדי <code>" reply. */
export function promoteFindingDraftTool(
  userText: string,
  picked: Set<string>,
  fullSchemaNames?: Set<string>,
): void {
  if (parseConfirmDraftReply(userText) !== null) {
    picked.add(TOOL_NAME);
    fullSchemaNames?.add(TOOL_NAME);
  }
}
