/**
 * Paid workshop tools run only on an approval the user gave, not one the model set itself.
 * A quote is stored on the project with a token, a short approval code and the chat turn it was
 * shown in. A confirm counts only with that token, in a later turn whose user message carries the
 * code (the "מאשר <code>" button sends it), within QUOTE_TTL_MS of the quote, for the same engine
 * and unit price, and for no more units than were quoted. The model never writes the user's
 * message, so text it read (a website, a tool result) cannot approve a spend. A run that David
 * approved through the approvals queue skips the message rule, not the price check.
 */

export type PaidTool =
  "workshop_make_creative" | "workshop_make_stills" | "workshop_produce_video";

export type Quote = {
  tool: PaidTool;
  engine: string;
  count: number;
  usd: number;
};

export type StoredApproval = Quote & {
  token: string;
  code?: string;
  turn_id: string | null;
  quoted_at: string;
  left: number;
  confirmed_turn?: string | null;
};

export type ApprovalContext = {
  token?: unknown;
  turnId?: string | null;
  /** The user's own message in this turn, exactly as they sent it. */
  userText?: string | null;
  approvedOutOfBand?: boolean;
};

export type ApprovalCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing"
        | "changed"
        | "same_turn"
        | "no_turn"
        | "not_user"
        | "expired";
    };

const KEY = "workshop_approvals";

/** How long a quote can be approved; after that the user sees a fresh price. */
export const QUOTE_TTL_MS = 30 * 60 * 1000;

/** The four characters the user sends back to approve; derived from the token. */
export const approvalCode = (token: string) =>
  token
    .replace(/[^a-z0-9]/gi, "")
    .slice(-4)
    .toUpperCase();

/** The tap-to-answer marker Carmen puts under the price (see src/lib/quickReplies.ts). */
export const approvalPrompt = (code: string) =>
  `[[בחירה: לאשר את העלות? | מאשר ${code} | לא עכשיו]]`;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const unit = (quote: { usd: number; count: number }) =>
  quote.count > 0 ? quote.usd / quote.count : quote.usd;

export function storedApproval(
  payload: Record<string, unknown>,
  tool: PaidTool,
): StoredApproval | null {
  const entry = asRecord(asRecord(payload[KEY])[tool]);
  return typeof entry.token === "string" ? (entry as StoredApproval) : null;
}

/** Stores a fresh quote; any earlier quote for the same tool stops being valid. */
export function issueApproval(
  payload: Record<string, unknown>,
  quote: Quote,
  turnId: string | null,
  token: string,
  now = new Date(),
): { payload: Record<string, unknown>; approval: StoredApproval } {
  const approval: StoredApproval = {
    ...quote,
    usd: Math.round(quote.usd * 100) / 100,
    token,
    code: approvalCode(token),
    turn_id: turnId,
    quoted_at: now.toISOString(),
    left: quote.count,
  };
  return {
    payload: {
      ...payload,
      [KEY]: { ...asRecord(payload[KEY]), [quote.tool]: approval },
    },
    approval,
  };
}

export function checkApproval(
  payload: Record<string, unknown>,
  quote: Quote,
  context: ApprovalContext,
  now = new Date(),
): ApprovalCheck {
  const stored = storedApproval(payload, quote.tool);
  const changed = (approval: StoredApproval) =>
    approval.engine !== quote.engine ||
    quote.count > approval.left ||
    Math.abs(unit(approval) - unit(quote)) > 0.01;
  if (context.approvedOutOfBand)
    return stored && changed(stored)
      ? { ok: false, reason: "changed" }
      : { ok: true };
  if (!stored || context.token !== stored.token)
    return { ok: false, reason: "missing" };
  if (changed(stored)) return { ok: false, reason: "changed" };
  if (stored.confirmed_turn) return { ok: true };
  if (!context.turnId) return { ok: false, reason: "no_turn" };
  if (stored.turn_id === context.turnId)
    return { ok: false, reason: "same_turn" };
  if (now.getTime() - Date.parse(stored.quoted_at) > QUOTE_TTL_MS)
    return { ok: false, reason: "expired" };
  const code = stored.code ?? approvalCode(stored.token);
  if (
    !String(context.userText ?? "")
      .toUpperCase()
      .includes(code)
  )
    return { ok: false, reason: "not_user" };
  return { ok: true };
}

/** Records units spent. The approval is removed once nothing is left. */
export function spendApproval(
  payload: Record<string, unknown>,
  tool: PaidTool,
  spent: number,
  turnId: string | null,
): Record<string, unknown> {
  const all = { ...asRecord(payload[KEY]) };
  const stored = storedApproval(payload, tool);
  if (!stored) return payload;
  const left = Math.max(0, stored.left - Math.max(0, spent));
  if (left === 0) delete all[tool];
  else
    all[tool] = {
      ...stored,
      left,
      confirmed_turn: stored.confirmed_turn ?? turnId ?? "approved",
    };
  return { ...payload, [KEY]: all };
}

export const APPROVAL_REFUSAL: Record<
  Exclude<ApprovalCheck, { ok: true }>["reason"],
  string
> = {
  missing:
    "אין אישור תקף מהמשתמש לעלות הזו. הציגי את העלות שחזרה עכשיו, הוסיפי את approval_prompt כמו שהוא, ועצרי. רק אחרי שהמשתמש לחץ על מאשר קראי עם confirmed=true ו-approval_token שחזר.",
  changed:
    "העלות או המנוע השתנו מאז האישור. הציגי למשתמש את העלות החדשה שחזרה וחכי לאישור חדש.",
  same_turn:
    "המשתמש עוד לא ענה על הצעת המחיר. הציגי לו את העלות ועצרי. אחרי שהוא מאשר בהודעה שלו, קראי עם confirmed=true ו-approval_token.",
  no_turn: "אי אפשר לאשר עלות מהערוץ הזה. בקשי מהמשתמש לאשר בצ׳אט של כרמן.",
  not_user:
    "ההודעה של המשתמש לא כוללת את קוד האישור. הציגי את העלות ואת approval_prompt כמו שהוא, ועצרי עד שהמשתמש ילחץ על מאשר.",
  expired:
    "הצעת המחיר פגה. הציגי למשתמש את העלות החדשה שחזרה ואת approval_prompt, ועצרי.",
};
