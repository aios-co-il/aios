/**
 * "תעדי <code>": logs the contact a contact_not_logged finding drafted, on
 * the client card as a call or meeting Carmen wrote at this person's request
 * (source carmen_confirmed, counts_as_contact, in their name), and resolves
 * the finding. carmen_finding_confirm_contact decides within the tenant
 * whether this person may, and writes the entry and the resolution together.
 * Only for the code the person wrote themselves, in a private chat. A code
 * that does not exist and one they may not log get the same refusal, so
 * codes cannot be probed.
 */
import { HUMAN_REQUESTER_REQUIRED_HE } from "../client-card-contact-policy.ts";
import {
  CONFIRM_DRAFT_WORD_HE,
  type ContactDraft,
  contactDraftOf,
} from "../../_shared/manager-round/contact-draft.ts";
import { trimmedText } from "../../_shared/pulse/json.ts";
import { refuse, type ToolResult, typedCode } from "./args.ts";
import type { DraftFinding, FindingDraftPorts } from "./ports.ts";
import type { FindingDraftReply } from "./reply.ts";

export type ConfirmInput = {
  tenantId: string;
  args: Record<string, unknown>;
  /** The person talking to Carmen now; null in automated runs. */
  requesterUserId: string | null;
  /** The message this run answers; null when the run has none. */
  reply: FindingDraftReply | null;
};

type FoundDraft = { finding: DraftFinding; draft: ContactDraft };

const PRIVATE_ONLY_HE = "אפשר לתעד פריט רק בשיחה פרטית איתי, לא בקבוצה.";
const REPLY_REQUIRED_HE = `כדי לתעד, כתבו לי "${CONFIRM_DRAFT_WORD_HE}" ואת מספר הפריט מההודעה שלי.`;
const READ_ONLY_HE =
  "כרטיס הלקוח משותף איתנו לקריאה בלבד, ולכן אי אפשר לתעד בו מכאן.";

/** Checks who asks and where, finds the draft and logs it; refusals are tool results. */
export async function confirmFindingDraft(
  ports: FindingDraftPorts,
  input: ConfirmInput,
): Promise<ToolResult> {
  const userId = input.requesterUserId;
  if (!userId) {
    return refuse("human_requester_required", HUMAN_REQUESTER_REQUIRED_HE);
  }
  if (input.reply?.inGroup) {
    return refuse("private_chat_only", PRIVATE_ONLY_HE);
  }
  const code = replyCode(input);
  if (code === null) {
    return refuse("reply_required", REPLY_REQUIRED_HE);
  }
  const found = await findDraft(ports, input.tenantId, code);
  return found ? logDraft(ports, input, found, userId) : notFound(code);
}

/** Logs the draft (or the person's own wording) and reads the outcome back. */
async function logDraft(
  ports: FindingDraftPorts,
  input: ConfirmInput,
  found: FoundDraft,
  userId: string,
): Promise<ToolResult> {
  const content = trimmedText(input.args.content) ?? found.draft.text_he;
  const result = await ports.confirm({
    tenantId: input.tenantId,
    findingId: found.finding.id,
    userId,
    updateType: found.draft.update_type,
    content,
  });
  if (result.outcome === "read_only") {
    return refuse("read_only", READ_ONLY_HE);
  }
  if (result.outcome === "not_found") {
    return notFound(found.finding.short_code);
  }
  return {
    success: true,
    short_code: found.finding.short_code,
    update_id: result.entryId,
    created: result.inserted,
    update_type: found.draft.update_type,
    attributed_user_id: userId,
    message: `נרשם בכרטיס הלקוח: ${content}`,
  };
}

/** The live contact_not_logged finding with the code, and its draft. */
async function findDraft(
  ports: FindingDraftPorts,
  tenantId: string,
  code: number,
): Promise<FoundDraft | null> {
  const finding = await ports.findLive(tenantId, code);
  const draft =
    finding?.kind === "contact_not_logged"
      ? contactDraftOf(finding.evidence)
      : null;
  return finding && draft ? { finding, draft } : null;
}

/**
 * The code the person wrote ("תעדי 123"). Null when their message has none
 * or the model asks for another code, so a code read elsewhere (history,
 * tool output) never logs a contact in their name.
 */
function replyCode(input: ConfirmInput): number | null {
  return typedCode(input.reply?.shortCode ?? null, input.args.short_code);
}

/** The one refusal for an unknown code and one this person may not log. */
function notFound(code: number): ToolResult {
  return refuse(
    "not_found",
    `לא מצאתי פריט פתוח מספר ${code} שאפשר לתעד בשמך.`,
  );
}
