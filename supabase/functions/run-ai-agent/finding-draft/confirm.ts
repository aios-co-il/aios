/**
 * "תעדי <code>": logs the contact a contact_not_logged finding drafted, on
 * the client card as a call or meeting Carmen wrote at this person's request
 * (source carmen_confirmed, counts_as_contact, attributed to them), then
 * resolves the finding. Only the finding's person, a manager over it or (for
 * an unattributed call) a campaigner of the client may; the same refusal
 * covers a code that does not exist, so codes cannot be probed.
 */
import { ClientCardEntryError } from "../../_shared/client-card.ts";
import { HUMAN_REQUESTER_REQUIRED_HE } from "../../_shared/client-card-contact-policy.ts";
import {
  type ContactDraft,
  contactDraftOf,
} from "../../_shared/manager-round/contact-draft.ts";
import { type ConfirmCaller, confirmRight } from "./authorize.ts";
import { cardEntry, type ConfirmedEntry } from "./card-entry.ts";
import type { DraftFinding, FindingDraftPorts } from "./ports.ts";

export type ConfirmInput = {
  tenantId: string;
  args: Record<string, unknown>;
  /** The person talking to Carmen now; null in automated runs. */
  requesterUserId: string | null;
  caller: Omit<ConfirmCaller, "userId">;
  now: Date;
};

type ToolResult = Record<string, unknown>;

/** Finds, authorises, logs and resolves; every refusal is a tool result, never a throw. */
export async function confirmFindingDraft(
  ports: FindingDraftPorts,
  input: ConfirmInput,
): Promise<ToolResult> {
  if (!input.requesterUserId) {
    return refuse("human_requester_required", HUMAN_REQUESTER_REQUIRED_HE);
  }
  const caller = { ...input.caller, userId: input.requesterUserId };
  const code = shortCodeOf(input.args.short_code);
  const found = code ? await findDraft(ports, input.tenantId, code) : null;
  if (!found || !(await mayConfirm(ports, found.finding, caller, input))) {
    return refuse(
      "not_found",
      `לא מצאתי פריט פתוח${code ? ` מספר ${code}` : ""} שאפשר לתעד בשמך.`,
    );
  }
  return logDraft(ports, {
    tenantId: input.tenantId,
    finding: found.finding,
    updateType: found.draft.update_type,
    text: textOf(input.args.content) ?? found.draft.text_he,
    userId: caller.userId,
  });
}

/** Writes the card entry, then resolves the finding as handled by this person. */
async function logDraft(
  ports: FindingDraftPorts,
  entry: ConfirmedEntry,
): Promise<ToolResult> {
  try {
    const written = await ports.writeCard(cardEntry(entry));
    await ports.resolve(
      entry.tenantId,
      entry.finding.id,
      entry.userId,
      entry.text,
    );
    return {
      success: true,
      short_code: entry.finding.short_code,
      update_id: written.entryId,
      created: written.inserted,
      update_type: entry.updateType,
      attributed_user_id: written.userId,
      message: `נרשם בכרטיס הלקוח: ${entry.text}`,
    };
  } catch (error) {
    if (error instanceof ClientCardEntryError) {
      return refuse(error.code, error.message);
    }
    throw error;
  }
}

type FoundDraft = {
  finding: DraftFinding & { client_id: string };
  draft: ContactDraft;
};

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
  const clientId = finding?.client_id;
  return finding && draft && clientId
    ? { finding: { ...finding, client_id: clientId }, draft }
    : null;
}

/** confirmRight, asking about the client's assignment only when that decides it. */
async function mayConfirm(
  ports: FindingDraftPorts,
  finding: FoundDraft["finding"],
  caller: ConfirmCaller,
  input: ConfirmInput,
): Promise<boolean> {
  const right = confirmRight(finding, caller);
  if (right !== "if_assigned" || !caller.campaignerId) {
    return right === "yes";
  }
  return ports.isAssigned(
    input.tenantId,
    finding.client_id,
    caller.campaignerId,
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

/** The caller's own wording, when they gave one. */
function textOf(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** A refusal Carmen reads back to the person. */
function refuse(error: string, message: string): ToolResult {
  return { success: false, error, message };
}
