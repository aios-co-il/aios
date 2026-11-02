import {
  isExplicitApprovalPhrase,
  isExplicitRejectionPhrase,
  normalizeApprovalText,
} from "../../_shared/wa-approval-flow.ts";

/**
 * Classify a chat reply. "כן 4821" approves code 4821; "לא 4821" rejects it.
 * A 6-digit code is shown only when two listed rows share 4 digits.
 */
export function parseApprovalReply(text: unknown): {
  approve: boolean;
  reject: boolean;
  code: string | null;
} {
  const t = normalizeApprovalText(text);
  const a = t.match(APPROVE_WITH_CODE_RE);
  if (a) {
    return { approve: true, reject: false, code: a[1] };
  }

  const r = t.match(REJECT_WITH_CODE_RE);
  if (r) {
    return { approve: false, reject: true, code: r[1] };
  }

  return {
    approve: isExplicitApprovalPhrase(t),
    reject: isExplicitRejectionPhrase(t),
    code: null,
  };
}

const APPROVE_WITH_CODE_RE =
  /^(?:כן|מאשר|מאשרת|אשר|אשרי|תאשרי|yes|approve|ok)[\s,:\-–]*(?:קוד\s*)?#?(\d{6}|\d{4})[\s.!]*$/iu;
const REJECT_WITH_CODE_RE =
  /^(?:לא|דחה|דחי|בטל|בטלי|no|reject|cancel)[\s,:\-–]*(?:קוד\s*)?#?(\d{6}|\d{4})[\s.!]*$/iu;
