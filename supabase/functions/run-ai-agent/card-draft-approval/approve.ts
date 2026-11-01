/**
 * "אשר <code>": writes the card entry a finding drafted (a group digest:
 * source group_digest, attributed to the client's campaigner, never counted
 * as contact) and, when the group reported a call or meeting as held, that
 * contact (card-contact.ts: the approving person vouches for it, unless
 * they said to leave it out), then closes the finding as fixed by the
 * approving person.
 * Only for the code the person typed ("אשר <code>", finding-draft/reply.ts),
 * never one the model read elsewhere, and "בלי שיחה" is read from their
 * words too. Only in a private chat with Carmen: a group session is
 * client-visible, so there the tool refuses without naming the client or
 * the draft. Only a
 * person the findings feed shows the finding to may approve it: the database
 * owns that rule (carmen_finding_role_of, which the feed's RLS reads too),
 * and the closing function checks it again. The same refusal covers a code
 * that does not exist or a finding already closed (approved, or written by
 * Carmen), so codes cannot be probed and nothing is written twice.
 */
import { ClientCardEntryError } from "../../_shared/client-card/entry-types.ts";
import {
  APPROVE_DRAFT_WORD_HE,
  type CardDraft,
  cardDraftContent,
  cardDraftOf,
} from "../../_shared/manager-round/card-draft.ts";
import { writeCardDraft } from "../../_shared/manager-round/card-draft-write.ts";
import { contactKindLabel } from "../../_shared/manager-round/card-contact.ts";
import { trimmedText } from "../../_shared/pulse/json.ts";
import { refuse, type ToolResult, typedCode } from "../finding-draft/args.ts";
import type { FindingDraftReply } from "../finding-draft/reply.ts";
import type { ApprovalPorts, DraftFinding } from "./ports.ts";

export type ApproveInput = {
  tenantId: string;
  args: Record<string, unknown>;
  /** The person talking to Carmen now; null in automated runs. */
  requesterUserId: string | null;
  /** The message this run answers (finding-draft/reply.ts); null when the run has none. */
  reply: FindingDraftReply | null;
};

type FoundDraft = {
  finding: DraftFinding & { client_id: string };
  draft: CardDraft;
};

const PRIVATE_CHAT_ONLY_HE =
  "אישור טיוטה לכרטיס הלקוח נעשה רק בצ׳אט הפרטי עם כרמן, לא בקבוצה.";
const NO_REQUESTER_HE =
  "טיוטה נרשמת בכרטיס הלקוח רק כשאיש צוות מאשר אותה. בריצה הזאת אין איש צוות שמאשר, ולכן לא נרשם דבר.";
const REPLY_REQUIRED_HE = `כדי לרשום, כתבו לי "${APPROVE_DRAFT_WORD_HE}" ואת מספר הפריט מההודעה שלי.`;

/** Finds, authorises, writes and closes; every refusal is a tool result, never a throw. */
export async function approveCardDraft(
  ports: ApprovalPorts,
  input: ApproveInput,
): Promise<ToolResult> {
  if (input.reply?.inGroup) {
    return refuse("private_chat_only", PRIVATE_CHAT_ONLY_HE);
  }
  if (!input.requesterUserId) {
    return refuse("human_requester_required", NO_REQUESTER_HE);
  }
  const userId = input.requesterUserId;
  const code = typedCode(
    input.reply?.approveCode ?? null,
    input.args.short_code,
  );
  if (code === null) {
    return refuse("reply_required", REPLY_REQUIRED_HE);
  }
  const found = await findDraft(ports, input.tenantId, code);
  if (!found || !(await mayApprove(ports, input.tenantId, found, userId))) {
    return refuse(
      "not_found",
      `לא מצאתי טיוטה פתוחה מספר ${code} שאפשר לאשר בשמך.`,
    );
  }
  const wording = trimmedText(input.args.content);
  const draft = wording
    ? { ...found.draft, content: cardDraftContent(found.draft.source, wording) }
    : found.draft;
  return write(
    ports,
    input.tenantId,
    { ...found, draft: keptContact(draft, input.reply?.skipContact === true) },
    userId,
  );
}

/** Writes the entry and closes the finding as this person's approval. */
async function write(
  ports: ApprovalPorts,
  tenantId: string,
  found: FoundDraft,
  userId: string,
): Promise<ToolResult> {
  try {
    const written = await writeCardDraft(ports.write, {
      tenantId,
      finding: found.finding,
      draft: found.draft,
      approvedBy: userId,
    });
    return {
      success: true,
      short_code: found.finding.short_code,
      update_id: written.entryId,
      created: written.inserted,
      // false when someone closed the finding meanwhile; the entry is on the card.
      resolved: written.resolved,
      attributed_user_id: written.attributedUserId,
      contact_update_id: written.contactEntryId,
      message: writtenMessage(found),
    };
  } catch (error) {
    if (error instanceof ClientCardEntryError) {
      return refuse(error.code, error.message);
    }
    throw error;
  }
}

/** The draft, without its reported contact when the person wrote "בלי שיחה". */
function keptContact(draft: CardDraft, skip: boolean): CardDraft {
  if (!skip || !draft.contact) {
    return draft;
  }
  const { contact: _left, ...summary } = draft;
  return summary;
}

/** What Carmen tells the approving person was written. */
function writtenMessage(found: FoundDraft): string {
  const code = found.finding.short_code;
  const contact = found.draft.contact;
  return contact
    ? `נרשם בכרטיס הלקוח (פריט ${code}), וה${contactKindLabel(contact.update_type)} שדווחה בקבוצה נרשמה כקשר עם הלקוח.`
    : `נרשם בכרטיס הלקוח (פריט ${code}).`;
}

/** The live finding with the code and its draft. */
async function findDraft(
  ports: ApprovalPorts,
  tenantId: string,
  code: number,
): Promise<FoundDraft | null> {
  const finding = await ports.findLive(tenantId, code);
  const draft = finding ? cardDraftOf(finding.evidence) : null;
  const clientId = finding?.client_id;
  return finding && draft && clientId
    ? { finding: { ...finding, client_id: clientId }, draft }
    : null;
}

/** True when the findings feed shows the finding to the person (the database's rule). */
async function mayApprove(
  ports: ApprovalPorts,
  tenantId: string,
  found: FoundDraft,
  userId: string,
): Promise<boolean> {
  return (await ports.roleOf(tenantId, found.finding, userId)) !== null;
}
