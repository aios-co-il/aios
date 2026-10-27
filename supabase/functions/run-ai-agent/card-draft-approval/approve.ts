/**
 * "אשר <code>": writes the card entry a finding drafted (a group digest:
 * source group_digest, attributed to the client's campaigner, never counted
 * as contact), then closes the finding as fixed by the approving person.
 * Only in a private chat with Carmen: a group session is client-visible, so
 * there the tool refuses without naming the client or the draft. Only the
 * finding's person, a manager over it or a campaigner of the client may
 * (authorize.ts, from roles in the run's tenant, which is also what the
 * closing function requires of the actor); the same refusal covers a code
 * that does not exist or a finding already closed (approved, or written by
 * Carmen), so codes cannot be probed and nothing is written twice.
 */
import { ClientCardEntryError } from "../../_shared/client-card/entry-types.ts";
import {
  type CardDraft,
  cardDraftContent,
  cardDraftOf,
} from "../../_shared/manager-round/card-draft.ts";
import { writeCardDraft } from "../../_shared/manager-round/card-draft-write.ts";
import { approveRight } from "./authorize.ts";
import type { ApprovalPorts, DraftFinding } from "./ports.ts";

export type ApproveInput = {
  tenantId: string;
  args: Record<string, unknown>;
  /** The person talking to Carmen now; null in automated runs. */
  requesterUserId: string | null;
  /** The run is a WhatsApp group session, which the client can read. */
  isGroup: boolean;
  now: Date;
};

type ToolResult = Record<string, unknown>;

type FoundDraft = {
  finding: DraftFinding & { client_id: string };
  draft: CardDraft;
};

const PRIVATE_CHAT_ONLY_HE =
  "אישור טיוטה לכרטיס הלקוח נעשה רק בצ׳אט הפרטי עם כרמן, לא בקבוצה.";
const NO_REQUESTER_HE =
  "טיוטה נרשמת בכרטיס הלקוח רק כשאיש צוות מאשר אותה. בריצה הזאת אין איש צוות שמאשר, ולכן לא נרשם דבר.";

/** Finds, authorises, writes and closes; every refusal is a tool result, never a throw. */
export async function approveCardDraft(
  ports: ApprovalPorts,
  input: ApproveInput,
): Promise<ToolResult> {
  if (input.isGroup) {
    return refuse("private_chat_only", PRIVATE_CHAT_ONLY_HE);
  }
  if (!input.requesterUserId) {
    return refuse("human_requester_required", NO_REQUESTER_HE);
  }
  const userId = input.requesterUserId;
  const code = shortCodeOf(input.args.short_code);
  const found = code ? await findDraft(ports, input.tenantId, code) : null;
  if (!found || !(await mayApprove(ports, found, userId, input))) {
    return refuse(
      "not_found",
      `לא מצאתי טיוטה פתוחה${code ? ` מספר ${code}` : ""} שאפשר לאשר בשמך.`,
    );
  }
  const wording = textOf(input.args.content);
  const draft = wording
    ? { ...found.draft, content: cardDraftContent(found.draft.source, wording) }
    : found.draft;
  return write(ports, input.tenantId, { ...found, draft }, userId);
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
      attributed_user_id: written.attributedUserId,
      message: `נרשם בכרטיס הלקוח (פריט ${found.finding.short_code}).`,
    };
  } catch (error) {
    if (error instanceof ClientCardEntryError) {
      return refuse(error.code, error.message);
    }
    throw error;
  }
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

/** approveRight over the person's roles in the tenant; the assignment only when it decides. */
async function mayApprove(
  ports: ApprovalPorts,
  found: FoundDraft,
  userId: string,
  input: ApproveInput,
): Promise<boolean> {
  const approver = await ports.approver(input.tenantId, userId);
  const right = approveRight(found.finding, approver);
  if (right !== "if_assigned" || !approver.campaignerId) {
    return right === "yes";
  }
  return ports.isAssigned(
    input.tenantId,
    found.finding.client_id,
    approver.campaignerId,
    input.now,
  );
}

/** A positive integer code from a number or text such as "#123". */
function shortCodeOf(raw: unknown): number | null {
  const code = Number(
    String(raw ?? "")
      .replace(/^#/, "")
      .trim(),
  );
  return Number.isInteger(code) && code > 0 ? code : null;
}

/** The person's own wording, when they gave one. */
function textOf(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** A refusal Carmen reads back to the person. */
function refuse(error: string, message: string): ToolResult {
  return { success: false, error, message };
}
