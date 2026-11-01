/**
 * Carmen's approve_card_draft tool (AIO-254): a staff member replies
 * "אשר <code>" in a private chat to an item about a client group update that
 * is not on the card, and the drafted entry is written to the client card.
 * Wired into run-ai-agent with one import, one spread and one dispatch block.
 */
import {
  APPROVE_DRAFT_WORD_HE,
  parseApproveDraftReply,
} from "../../_shared/manager-round/card-draft.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { approveCardDraft, type ApproveInput } from "./approve.ts";
import { approvalPorts } from "./store.ts";

const TOOL_NAME = "approve_card_draft";

export const CARD_DRAFT_TOOLS = [
  {
    name: TOOL_NAME,
    description: `רישום בכרטיס הלקוח של טיוטת עדכון שכרמן הכינה מקבוצת הוואטסאפ של הלקוח. להפעיל כשאיש צוות עונה "${APPROVE_DRAFT_WORD_HE} <מספר>" (או "${APPROVE_DRAFT_WORD_HE} #<מספר>") על פריט שכרמן שלחה. רושם את הטיוטה שבפריט, או את הנוסח שאיש הצוות כתב, כסיכום קבוצה על שם הקמפיינר של הלקוח (לא נספר כשיחה). אם בפריט יש שיחה או פגישה שהתקיימה ודווחה בקבוצה, האישור רושם גם אותה כקשר עם הלקוח, על שם איש הצוות שכתב עליה או הקמפיינר, אלא אם איש הצוות כתב "בלי שיחה" או "בלי פגישה". רק בצ׳אט פרטי עם כרמן, לא בקבוצה. מותר למי שרואה את הפריט אצל כרמן (קמפיינר של הלקוח או מנהל); לאחרים הכלי מסרב.`,
    parameters: {
      type: "object",
      properties: {
        short_code: {
          type: "integer",
          description: "מספר הפריט מההודעה של כרמן, בלי #",
        },
        content: {
          type: "string",
          description: "נוסח משלו לעדכון, רק אם איש הצוות כתב כזה",
        },
        skip_contact: {
          type: "boolean",
          description:
            'true רק אם איש הצוות כתב "בלי שיחה" או "בלי פגישה": נרשם סיכום הקבוצה בלי השיחה או הפגישה',
        },
      },
      required: ["short_code"],
    },
  },
];

/** True for this module's tool. */
export function isCardDraftTool(name: string): boolean {
  return name === TOOL_NAME;
}

/** Runs the tool over the service-role client of the run. */
export function executeCardDraftTool(
  db: DbClient,
  input: ApproveInput,
): Promise<Record<string, unknown>> {
  return approveCardDraft(approvalPorts(db), input);
}

/** Offers the tool to the model whenever the message is an "אשר <code>" reply. */
export function promoteCardDraftTool(
  userText: string,
  picked: Set<string>,
  fullSchemaNames?: Set<string>,
): void {
  if (parseApproveDraftReply(userText) !== null) {
    picked.add(TOOL_NAME);
    fullSchemaNames?.add(TOOL_NAME);
  }
}
