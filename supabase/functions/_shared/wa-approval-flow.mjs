/**
 * WhatsApp / chat approval-flow helpers for Carmen Meta (and other) pending actions.
 * Detects explicit confirm/reject phrases and helps resolve the latest matching
 * pending approval without repeated "לאשר?" loops.
 */

export const META_APPROVAL_TOOLS = Object.freeze([
  "fb_duplicate_ad_variants",
  "duplicate_facebook_ad_variants",
  "toggle_facebook_campaign",
  "duplicate_facebook_campaign",
  "update_facebook_budget",
  "fb_create_campaign",
  "fb_create_adset",
  "fb_create_ad",
  "fb_create_creative_from_media",
  "fb_replace_lead_form",
  "fb_update_budget",
  "fb_pause",
  "fb_resume",
  "gads_pause",
  "gads_resume",
  "gads_update_budget",
]);

/** Strip WhatsApp noise (🎤 prefix, punctuation) for phrase matching. */
export function normalizeApprovalText(text) {
  if (text == null) return "";
  return String(text)
    .replace(/🎤/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Explicit user confirmation that a prepared approval should run.
 * Matches short WhatsApp replies: כן / מאשר / כן מאשר / אשרי / תעשי את זה / yes / approve.
 */
export function isExplicitApprovalPhrase(text) {
  const t = normalizeApprovalText(text);
  if (!t || t.length > 80) return false;
  const lower = t.toLowerCase();

  // Pure / near-pure Hebrew confirms
  if (/^(כן|כן\.|כֵן)([\s,!.]*)$/u.test(t)) return true;
  if (/^(כן\s+מאשר|מאשר|מאשרת|אשרי|אשר|מאשר\/ת)([\s,!.]*)$/u.test(t))
    return true;
  if (
    /^(כן[\s,]+)?(תעשי|תעשה|תבצעי|תבצע|תריצי|תריץ)\s+(את\s+)?(זה|הפעולה|הבקשה|האישור)([\s,!.]*)$/u.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /^(יאללה|סבבה|בסדר|אוקיי|אוקי|ok|okay)\s*,?\s*(כן|תעשי|תבצעי)?([\s,!.]*)$/iu.test(
      t,
    )
  ) {
    // Only when paired with confirm intent or alone as ack after approval ask —
    // require כן/תעשי or exact ok/סבבה alone under 12 chars.
    if (/כן|תעשי|תבצעי|תעשה|תבצע/u.test(t)) return true;
    if (
      /^(יאללה|סבבה|בסדר|אוקיי|אוקי|ok|okay)([\s,!.]*)$/iu.test(t) &&
      t.length <= 12
    )
      return true;
  }

  // English
  if (
    /^(yes|yep|yeah|approve|approved|do\s+it|go\s+ahead|confirm|confirmed)([\s,!.]*)$/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /^(yes[\s,]+)?(please\s+)?(do\s+it|go\s+ahead|approve)([\s,!.]*)$/i.test(
      lower,
    )
  )
    return true;

  // Soft: "כן מאשר את השכפול" etc. — starts with confirm + short rest
  if (/^(כן(\s+מאשר)?|מאשר|אשרי)\b/u.test(t) && t.length <= 40) return true;

  return false;
}

export function isExplicitRejectionPhrase(text) {
  const t = normalizeApprovalText(text);
  if (!t || t.length > 80) return false;
  const lower = t.toLowerCase();
  if (/^(לא|לא\.|לא\s+מאשר|דחה|דחי|בטל|ביטול)([\s,!.]*)$/u.test(t)) return true;
  if (/^(no|nope|reject|cancel|don't|do\s+not)([\s,!.]*)$/i.test(lower))
    return true;
  return false;
}

export function isMetaApprovalTool(toolName) {
  if (!toolName) return false;
  return META_APPROVAL_TOOLS.includes(String(toolName));
}

/**
 * Pick the best pending row from a newest-first list.
 * Prefer Meta mutating tools when preferMeta is true.
 */
export function pickLatestPendingApproval(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.length === 0) return null;
  const preferMeta = opts.preferMeta !== false;
  if (preferMeta) {
    const meta = list.find((r) => isMetaApprovalTool(r.tool_name));
    if (meta) return meta;
  }
  if (opts.toolName) {
    const match = list.find((r) => r.tool_name === opts.toolName);
    if (match) return match;
  }
  return list[0];
}

/**
 * Build recovery payload when user confirmed but nothing is pending.
 * Uses the newest recent Meta (or any) approval that still has tool_input.
 */
export function buildNoPendingRecovery(recentRows) {
  const list = Array.isArray(recentRows) ? recentRows.filter(Boolean) : [];
  const candidate =
    list.find(
      (r) =>
        isMetaApprovalTool(r.tool_name) &&
        r.tool_input &&
        r.status !== "executed",
    ) ||
    list.find((r) => isMetaApprovalTool(r.tool_name) && r.tool_input) ||
    list.find((r) => r.tool_input && r.status !== "executed") ||
    null;

  if (!candidate) {
    return {
      recovery: null,
      instruction_for_carmen:
        "אין בקשת אישור פתוחה וגם אין בקשה אחרונה לשחזור. אל תטעני שבוצע משהו. שאלי בקצרה מה הפעולה שצריך להכין מחדש, הכיני approval אחד, הציגי סיכום, ובקשי אישור סופי אחד בלבד.",
    };
  }

  const variantPreview =
    candidate.context?.variant_previews ||
    candidate.tool_input?.variants ||
    null;

  return {
    recovery: {
      mode: "recreate_once",
      previous_approval_id: candidate.id,
      previous_status: candidate.status,
      tool_name: candidate.tool_name,
      tool_input: candidate.tool_input,
      title: candidate.title,
      description: candidate.description,
      summary: candidate.title || candidate.description || candidate.tool_name,
      variant_previews: variantPreview,
    },
    instruction_for_carmen:
      'אין pending כרגע. שחזרי פעם אחת בלבד את אותה בקשה עם אותו tool_name + tool_input (או קראי לכלי המקורי עם אותם ארגומנטים), הציגי סיכום ברור מה יקרה, ובקשי אישור סופי אחד: "לאשר? (כן/לא)". ' +
      "אחרי שהמשתמש יאשר שוב — חובה לקרוא ל-execute_pending_approval. אסור לטעון שבוצע בלי הצלחת execute_pending_approval. אסור ללולאת אישורים חוזרת.",
  };
}

export function buildApprovalConfirmPromptRule(pending) {
  if (!pending) {
    return (
      "\n\n✅ **אישור WhatsApp:** המשתמש אישר במפורש. חובה עכשיו לקרוא ל-execute_pending_approval " +
      "(בלי approval_id אם צריך — הכלי יבחר את ה-pending האחרון). " +
      "אם הכלי מחזיר no_pending_approval עם recovery — שחזרי פעם אחת והבקשי אישור סופי אחד. " +
      "אסור לכתוב שבוצע/נוצר/עודכן בלי success=true מ-execute_pending_approval."
    );
  }
  return (
    `\n\n✅ **אישור WhatsApp (חובה לבצע עכשיו):** המשתמש אישר במפורש את הבקשה הפתוחה:\n` +
    `• approval_id: ${pending.id}\n` +
    `• פעולה: ${pending.title || pending.tool_name}\n` +
    `קראי מיד ל-execute_pending_approval עם approval_id="${pending.id}". ` +
    `אל תיצרי בקשת אישור חדשה. אל תשאלי שוב "לאשר?". ` +
    `אסור לכתוב שבוצע בלי שהכלי החזיר success=true.`
  );
}

/** carmen-approval-execute / chat error codes in the words the user sees (as in ApprovalsTab). */
export const APPROVAL_ERROR_MESSAGES_HE = Object.freeze({
  approver_role_required: "הפעולה הזו דורשת אישור של בעלים או מנהל/ת סוכנות",
  not_requester: "רק מי שביקש את הפעולה או מנהל/ת יכולים להחליט עליה",
  approver_required: "לא זוהה משתמש מאשר",
  no_identity: "לא זוהה משתמש מאשר",
  approval_not_found: "הבקשה לא נמצאה",
  expired: "פג תוקף הבקשה",
  in_progress: "הבקשה כבר בביצוע",
  not_pending: "הבקשה כבר טופלה",
  "approval already decided": "הבקשה כבר טופלה",
  rejected: "הבקשה נדחתה קודם",
  unknown_tool: "אין מנגנון ביצוע לפעולה הזו",
  unauthorized: "אין הרשאה לבצע את הפעולה",
});

export function formatApprovalExecutionReply(execResult, pendingRow) {
  const title = pendingRow?.title || pendingRow?.tool_name || "הפעולה";
  const ok = !!(
    execResult &&
    (execResult.success === true || execResult.already_executed === true)
  );
  if (ok) {
    const already = execResult.already_executed ? " (כבר בוצע קודם)" : "";
    return `בוצע: ${title}${already}.`;
  }
  const code =
    execResult?.error ||
    execResult?.result?.error ||
    execResult?.message ||
    "הביצוע נכשל";
  const err =
    typeof code !== "string"
      ? String(code?.message || JSON.stringify(code))
      : Object.hasOwn(APPROVAL_ERROR_MESSAGES_HE, code)
        ? APPROVAL_ERROR_MESSAGES_HE[code]
        : code;
  // The executor failed after claiming the row: the action may have run.
  if (execResult?.outcome_unknown === true) {
    return `לא הצלחתי לוודא אם "${title}" בוצע: ${err}. ייתכן שהפעולה כן בוצעה — כדאי לבדוק לפני שמנסים שוב.`;
  }
  // A row someone else is running right now may still succeed.
  const nothingDone = code === "in_progress" ? "" : " לא בוצע כלום.";
  return `לא הצלחתי לבצע את "${title}": ${err}.${nothingDone}`;
}

export function buildApprovalFlowAcceptanceCases() {
  return {
    approve: [
      "כן",
      "מאשר",
      "כן מאשר",
      "אשרי",
      "תעשי את זה",
      "yes",
      "approve",
      "go ahead",
      "כן.",
    ],
    reject: ["לא", "לא מאשר", "no", "reject"],
    notApproval: [
      "כן אבל תבדקי קודם את התקציב של כל הקמפיינים לפני",
      "מה מצב הלידים היום?",
    ],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Bound approvals (AIO-230)
//
// A chat "כן" runs only a pending row the same user requested in the same
// conversation within the last 30 minutes. Anything else is listed with a short
// code ("כן 4821" picks one). Money, external sends, config and destructive rows
// need an approver role. carmen-approval-execute applies the same role gate to
// every caller, so the chat rules here are the first line, not the only one.
// ───────────────────────────────────────────────────────────────────────────

export const APPROVAL_CONFIRM_WINDOW_MS = 30 * 60 * 1000;

/** Roles that may approve money, external_send, config and destructive rows. */
export const APPROVER_ROLES = Object.freeze([
  "owner",
  "agency_owner",
  "super_admin",
]);

/** Columns the chat picker needs from agent_approval_queue. */
export const APPROVAL_PICK_COLUMNS =
  "id, action_type, title, description, tool_name, tool_input, context, created_at, status, requested_by, expires_at, run_id";

/** Risk class per approval tool_name (direct-tool rows use the called tool's name). */
const APPROVAL_RISK_BY_TOOL = Object.freeze({
  // Ad spend and delivery (Meta / Google)
  fb_create_campaign: "money",
  fb_create_adset: "money",
  fb_create_ad: "money",
  fb_update_budget: "money",
  fb_pause: "money",
  fb_resume: "money",
  fb_duplicate_ad_variants: "money",
  duplicate_facebook_ad_variants: "money",
  toggle_facebook_campaign: "money",
  update_facebook_budget: "money",
  duplicate_facebook_campaign: "money",
  gads_pause: "money",
  gads_resume: "money",
  gads_update_budget: "money",
  schedule_campaign_toggle: "money",
  // Accounting
  create_one_time_income: "money",
  delete_one_time_income: "money",
  record_income_payment: "money",
  delete_income_payment: "money",
  record_expense_payment: "money",
  delete_expense_payment: "money",
  update_client_retainer: "money",
  create_finance_entry: "money",
  // Messages that leave the agency
  send_broadcast_now: "external_send",
  schedule_broadcast: "external_send",
  send_message: "external_send",
  send_whatsapp_via_gateway: "external_send",
  publish_social_post: "external_send",
  reply_to_social_comment: "external_send",
  hide_social_comment: "external_send",
  send_calendar_invite: "external_send",
  update_calendar_invite: "external_send",
  cancel_calendar_invite: "external_send",
  join_meeting_for_client: "external_send",
  // Messages to staff
  send_whatsapp_to_staff: "notify_staff",
  send_message_to_campaigner: "notify_staff",
  // Configuration, access and agent behavior
  fb_create_creative_from_media: "config",
  fb_replace_lead_form: "config",
  create_automation: "config",
  edit_automation: "config",
  toggle_automation: "config",
  delete_automation: "config",
  toggle_integration: "config",
  create_agent: "config",
  update_agent: "config",
  create_skill: "config",
  update_skill: "config",
  create_campaigner: "config",
  create_sales_person: "config",
  create_agency: "config",
  connect_google_ads_account: "config",
  connect_client_meta_ad_account: "config",
  create_meta_lead_form: "config",
  set_automation_meta_lead_form: "config",
  set_campaign_table_active: "config",
  create_whatsapp_instance: "config",
  // Deletions
  delete_lead: "destructive",
  delete_task: "destructive",
  delete_memory: "destructive",
  // Internal, reversible
  cancel_broadcast: "internal_write",
});

/** Classes only an approver role may approve. Unknown tools are treated as approver-only. */
export const APPROVER_ONLY_RISK_CLASSES = Object.freeze([
  "money",
  "external_send",
  "config",
  "destructive",
  "unknown",
]);

/**
 * tool_names carmen-approval-execute can run (besides action_type='agent_direct_tool').
 * A test checks each one against the executor's source.
 */
export const CARMEN_EXECUTOR_TOOLS = Object.freeze([
  "fb_create_campaign",
  "fb_create_adset",
  "fb_create_ad",
  "fb_create_creative_from_media",
  "fb_replace_lead_form",
  "fb_update_budget",
  "fb_pause",
  "fb_resume",
  "fb_duplicate_ad_variants",
  "duplicate_facebook_ad_variants",
  "update_facebook_budget",
  "toggle_facebook_campaign",
  "duplicate_facebook_campaign",
  "gads_pause",
  "gads_resume",
  "gads_update_budget",
  "schedule_campaign_toggle",
  "create_automation",
  "toggle_automation",
  "delete_automation",
  "edit_automation",
  "send_broadcast_now",
  "schedule_broadcast",
  "cancel_broadcast",
  "create_one_time_income",
  "delete_one_time_income",
  "record_income_payment",
  "delete_income_payment",
  "record_expense_payment",
  "delete_expense_payment",
  "update_client_retainer",
]);

const CARMEN_EXECUTOR_TOOL_SET = new Set(CARMEN_EXECUTOR_TOOLS);

/** @returns {'money'|'external_send'|'notify_staff'|'config'|'destructive'|'internal_write'|'unknown'} */
export function approvalRiskClass(row) {
  const tool = String(row?.tool_name || "");
  return APPROVAL_RISK_BY_TOOL[tool] || "unknown";
}

export function approvalNeedsApproverRole(row) {
  return APPROVER_ONLY_RISK_CLASSES.includes(approvalRiskClass(row));
}

export function isApproverRole(roles) {
  const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return list.some((r) => APPROVER_ROLES.includes(String(r)));
}

/** A row carmen-approval-execute knows how to run (not a run-ai-agent-v2 run step). */
export function isCarmenExecutableApproval(row) {
  if (!row || row.run_id) return false;
  return (
    row.action_type === "agent_direct_tool" ||
    CARMEN_EXECUTOR_TOOL_SET.has(String(row.tool_name || ""))
  );
}

/**
 * May this user run this row? Approver-only classes need an approver role;
 * the rest need the requester or an approver.
 * @returns {{ ok: boolean, reason: string|null, risk_class: string }}
 */
export function canApproveRow(row, { userId, roles } = {}) {
  const risk_class = approvalRiskClass(row);
  if (!userId) return { ok: false, reason: "no_identity", risk_class };
  const approver = isApproverRole(roles);
  if (APPROVER_ONLY_RISK_CLASSES.includes(risk_class)) {
    return approver
      ? { ok: true, reason: null, risk_class }
      : { ok: false, reason: "approver_role_required", risk_class };
  }
  if (approver || (row?.requested_by && row.requested_by === userId))
    return { ok: true, reason: null, risk_class };
  return { ok: false, reason: "not_requester", risk_class };
}

/** Rejecting is open to the requester (withdraw) and to approvers. */
export function canRejectRow(row, { userId, roles } = {}) {
  if (!userId) return { ok: false, reason: "no_identity" };
  if (
    isApproverRole(roles) ||
    (row?.requested_by && row.requested_by === userId)
  )
    return { ok: true, reason: null };
  return { ok: false, reason: "not_requester" };
}

/**
 * Server-side decision for carmen-approval-execute / resume-agent-run.
 * `member` = the approver belongs to the row's tenant (tenant_users or a tenant role).
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function approverDecision({ row, userId, roles, member, mode } = {}) {
  if (!userId) return { ok: false, status: 403, error: "approver_required" };
  const list = Array.isArray(roles) ? roles : [];
  // Do not reveal another tenant's rows.
  if (!member && !list.includes("super_admin"))
    return { ok: false, status: 404, error: "approval_not_found" };
  const gate =
    mode === "reject"
      ? canRejectRow(row, { userId, roles: list })
      : canApproveRow(row, { userId, roles: list });
  if (!gate.ok) return { ok: false, status: 403, error: gate.reason };
  return { ok: true };
}

export function isApprovalExpired(row, nowMs = Date.now()) {
  if (!row?.expires_at) return false;
  const t = Date.parse(row.expires_at);
  return Number.isFinite(t) && t <= nowMs;
}

/**
 * Identity of the conversation a request was made in.
 * Command Center / internal chat: the ai_conversations id. WhatsApp: the chat id
 * (falls back to the sender's phone). Other surfaces have none, so their rows are
 * never confirmed by a bare "כן".
 */
export function approvalConversationKey({
  surface,
  conversationId,
  waChatId,
  phone,
} = {}) {
  if (conversationId) return `conv:${conversationId}`;
  if (waChatId) return `wa:${waChatId}`;
  if (surface === "whatsapp") {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length >= 9) return `wa_phone:${digits.slice(-9)}`;
  }
  return null;
}

/** Context fields stamped on a new approval row. Null when there is no conversation. */
export function approvalBindingContext(input = {}) {
  const key = approvalConversationKey(input);
  if (!key) return null;
  return { conversation_key: key, conversation_surface: input.surface || null };
}

/**
 * New context for a just-created row, or null when nothing should change: only the
 * requester's own row is bound, and an existing binding is never moved.
 */
export function mergeApprovalBinding(row, { userId, binding } = {}) {
  if (!row || !binding || !userId) return null;
  if (row.requested_by !== userId) return null;
  if (row.context?.conversation_key) return null;
  const base =
    row.context &&
    typeof row.context === "object" &&
    !Array.isArray(row.context)
      ? row.context
      : {};
  return { ...base, ...binding };
}

/**
 * Short numeric code for a row, stable for its id. Years (1900-2099) and round
 * hundreds are skipped so a reply like "כן 2026" or "כן 5000" rarely hits a code.
 */
export function approvalShortCode(id) {
  const hex = String(id || "")
    .replace(/[^0-9a-f]/gi, "")
    .slice(0, 8);
  let n = hex ? parseInt(hex, 16) % 10000 : 0;
  for (let i = 0; i < 10; i++) {
    const looksNatural = (n >= 1900 && n <= 2099) || n % 100 === 0;
    if (!looksNatural) break;
    n = (n + 4321) % 10000;
  }
  return String(n).padStart(4, "0");
}

/** 6-digit code for a row whose 4-digit code collides with another listed row. */
export function approvalLongCode(id) {
  const hex = String(id || "")
    .replace(/[^0-9a-f]/gi, "")
    .slice(0, 12);
  const n = hex ? parseInt(hex, 16) % 1_000_000 : 0;
  return String(n).padStart(6, "0");
}

/** Does a typed code (4 or 6 digits) name this row? */
export function approvalCodeMatches(row, code) {
  const c = String(code || "");
  if (!row?.id || !c) return false;
  return c.length === 6
    ? approvalLongCode(row.id) === c
    : approvalShortCode(row.id) === c;
}

/**
 * Code shown for `row` in a list of `rows`: the 4-digit code, or the 6-digit one
 * when another listed row has the same 4 digits, so every listed row can be picked.
 */
export function approvalDisplayCode(row, rows = []) {
  const short = approvalShortCode(row?.id);
  const list = Array.isArray(rows) ? rows : [];
  const clash = list.some(
    (r) => r?.id && r.id !== row?.id && approvalShortCode(r.id) === short,
  );
  return clash ? approvalLongCode(row?.id) : short;
}

const APPROVE_WITH_CODE_RE =
  /^(?:כן|מאשר|מאשרת|אשר|אשרי|תאשרי|yes|approve|ok)[\s,:\-–]*(?:קוד\s*)?#?(\d{6}|\d{4})[\s.!]*$/iu;
const REJECT_WITH_CODE_RE =
  /^(?:לא|דחה|דחי|בטל|בטלי|no|reject|cancel)[\s,:\-–]*(?:קוד\s*)?#?(\d{6}|\d{4})[\s.!]*$/iu;

/**
 * Classify a chat reply. "כן 4821" approves code 4821; "לא 4821" rejects it.
 * A 6-digit code is shown only when two listed rows share 4 digits.
 * @returns {{ approve: boolean, reject: boolean, code: string|null }}
 */
export function parseApprovalReply(text) {
  const t = normalizeApprovalText(text);
  const a = t.match(APPROVE_WITH_CODE_RE);
  if (a) return { approve: true, reject: false, code: a[1] };
  const r = t.match(REJECT_WITH_CODE_RE);
  if (r) return { approve: false, reject: true, code: r[1] };
  return {
    approve: isExplicitApprovalPhrase(t),
    reject: isExplicitRejectionPhrase(t),
    code: null,
  };
}

/**
 * Decide which pending row a confirmation (or, with mode 'reject', a "לא") refers to.
 * rows: newest-first agent_approval_queue rows (APPROVAL_PICK_COLUMNS) of the tenant.
 * Reject mode uses the reject gate, so a requester can withdraw their own approver-only row.
 * @returns {{
 *   kind: 'match'|'forbidden'|'ambiguous'|'none'|'code_not_found'|'no_identity',
 *   via?: 'bound'|'code', row?: any, reason?: string, code?: string,
 *   candidates: any[], pickable: any[], blocked: number
 * }}
 */
export function resolveApprovalConfirm(
  rows,
  {
    userId,
    roles,
    conversationKey,
    code,
    mode = "approve",
    nowMs = Date.now(),
    windowMs = APPROVAL_CONFIRM_WINDOW_MS,
  } = {},
) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!userId)
    return { kind: "no_identity", candidates: [], pickable: [], blocked: 0 };
  const live = list.filter(
    (r) =>
      r.status === "pending" &&
      !isApprovalExpired(r, nowMs) &&
      isCarmenExecutableApproval(r),
  );
  const who = { userId, roles };
  const gate = (r) =>
    mode === "reject" ? canRejectRow(r, who) : canApproveRow(r, who);
  const pickable = live.filter((r) => gate(r).ok);

  if (code) {
    const byCode = pickable.filter((r) => approvalCodeMatches(r, code));
    if (byCode.length === 1)
      return {
        kind: "match",
        via: "code",
        row: byCode[0],
        candidates: [],
        pickable,
        blocked: 0,
      };
    if (byCode.length > 1)
      return {
        kind: "ambiguous",
        via: "code",
        candidates: byCode,
        pickable,
        blocked: 0,
      };
    return {
      kind: "code_not_found",
      code,
      candidates: pickable,
      pickable,
      blocked: 0,
    };
  }

  const bound = conversationKey
    ? live.filter((r) => {
        if (r.requested_by !== userId) return false;
        if (r.context?.conversation_key !== conversationKey) return false;
        const created = Date.parse(r.created_at);
        return Number.isFinite(created) && nowMs - created <= windowMs;
      })
    : [];
  const allowed = bound.filter((r) => gate(r).ok);
  const blocked = bound.length - allowed.length;

  if (bound.length === 1) {
    if (allowed.length === 1)
      return {
        kind: "match",
        via: "bound",
        row: bound[0],
        candidates: [],
        pickable,
        blocked: 0,
      };
    return {
      kind: "forbidden",
      via: "bound",
      row: bound[0],
      reason: gate(bound[0]).reason,
      candidates: [],
      pickable,
      blocked,
    };
  }
  if (bound.length > 1) {
    if (allowed.length === 0)
      return {
        kind: "forbidden",
        via: "bound",
        row: bound[0],
        reason: gate(bound[0]).reason,
        candidates: [],
        pickable,
        blocked,
      };
    return {
      kind: "ambiguous",
      via: "bound",
      candidates: allowed,
      pickable,
      blocked,
    };
  }
  return { kind: "none", candidates: pickable, pickable, blocked: 0 };
}

/** A short reply that Carmen answers without the LLM (execute, refuse, or list). */
export function isDeterministicApprovalPick(pick, text) {
  if (!pick) return false;
  if (normalizeApprovalText(text).length > 40) return false;
  return (
    pick.kind === "match" ||
    pick.kind === "forbidden" ||
    pick.kind === "ambiguous"
  );
}

function approvalAgeHe(createdAt, nowMs) {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.round((nowMs - t) / 60000));
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const hours = Math.round(min / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  return days === 1 ? "לפני יום" : `לפני ${days} ימים`;
}

/** "• 4821 · שינוי תקציב FB … (לפני 5 דק׳)" lines, at most `limit`. */
export function formatApprovalCandidateLines(
  candidates,
  { nowMs = Date.now(), limit = 5 } = {},
) {
  const list = Array.isArray(candidates) ? candidates : [];
  const lines = list.slice(0, limit).map((r) => {
    const title = r.title || r.tool_name || "פעולה";
    const age = approvalAgeHe(r.created_at, nowMs);
    return `• ${approvalDisplayCode(r, list)} · ${title}${age ? ` (${age})` : ""}`;
  });
  if (list.length > limit)
    lines.push(`ועוד ${list.length - limit} בקשות במסך האישורים`);
  return lines;
}

function approverOnlyText(row) {
  const title = row?.title || row?.tool_name || "הפעולה";
  return `"${title}" דורשת אישור של בעלים או מנהל/ת סוכנות, ולכן לא ביצעתי אותה. הבקשה ממתינה בתור האישורים.`;
}

/** Text Carmen sends for a non-match pick on the deterministic path. */
export function formatApprovalPickReply(pick, { nowMs = Date.now() } = {}) {
  if (!pick) return "";
  if (pick.kind === "forbidden") {
    if (pick.reason === "approver_role_required")
      return approverOnlyText(pick.row);
    return "לא ביצעתי כלום: אין לך הרשאה לאשר את הבקשה הזו.";
  }
  const lines = formatApprovalCandidateLines(pick.candidates, { nowMs });
  if (lines.length === 0)
    return "לא ביצעתי כלום: אין כרגע בקשה פתוחה שאפשר לאשר מכאן.";
  const example = approvalDisplayCode(pick.candidates[0], pick.candidates);
  const intro =
    pick.kind === "code_not_found"
      ? `לא מצאתי בקשה פתוחה עם הקוד ${pick.code}. הבקשות שאפשר לאשר:`
      : "לא ביצעתי כלום, כי לא ברור לאיזו בקשה התכוונת. הבקשות הפתוחות:";
  return `${intro}\n${lines.join("\n")}\n\nלאישור יש לשלוח "כן" ואחריו הקוד, למשל: כן ${example}`;
}

/** System-prompt rule for the LLM path after an approval reply. */
export function buildApprovalPickPromptRule(pick, { nowMs = Date.now() } = {}) {
  if (!pick) return "";
  if (pick.kind === "match") return buildApprovalConfirmPromptRule(pick.row);
  const never =
    "אסור לקרוא ל-execute_pending_approval ואסור לכתוב שבוצעה פעולה.";
  if (pick.kind === "no_identity")
    return `\n\nℹ️ **אישור:** לא זיהיתי מי כותב, ולכן אי אפשר לאשר מכאן בקשות פתוחות. ${never} אם ה"כן" עונה על שאלה אחרת שלך — המשיכי כרגיל.`;
  if (pick.kind === "forbidden")
    return `\n\n⛔ **אישור:** ${approverOnlyText(pick.row)} ${never} הסבירי זאת בקצרה.`;
  const lines = formatApprovalCandidateLines(pick.candidates, { nowMs });
  const list = lines.length ? `\n${lines.join("\n")}` : "";
  const ask = lines.length
    ? 'אם המשתמש התכוון לאשר, הציגי את הרשימה ובקשי לענות "כן" ואחריו הקוד (למשל "כן 1234").'
    : "אין כרגע בקשה פתוחה שהמשתמש יכול לאשר. אם צריך, הכיני את הבקשה מחדש פעם אחת ובקשי אישור.";
  if (pick.kind === "ambiguous")
    return `\n\n❓ **אישור:** יש כמה בקשות פתוחות ולא ברור איזו המשתמש מאשר. ${never} ${ask}${list}`;
  if (pick.kind === "code_not_found")
    return `\n\nℹ️ **אישור:** הקוד ${pick.code} לא תואם אף בקשה פתוחה. אם המספר עונה על שאלה אחרת שלך — המשיכי כרגיל. ${never} ${ask}${list}`;
  return `\n\nℹ️ **אישור:** אין בקשת אישור פתוחה של המשתמש בשיחה הזו מ-30 הדקות האחרונות. אם ה"כן" עונה על שאלה אחרת שלך — המשיכי כרגיל. ${never} ${ask}${list}`;
}

/**
 * execute_pending_approval result when the call does not resolve to the bound row
 * (or names another row than the bound one: `requestedId`).
 */
export function approvalPickToolResult(
  pick,
  { nowMs = Date.now(), requestedId = null } = {},
) {
  const otherRow =
    pick?.kind === "match" && requestedId && requestedId !== pick.row?.id;
  const listed = otherRow ? pick.pickable : pick?.candidates;
  const candidates = (listed || []).slice(0, 10).map((r) => ({
    code: approvalDisplayCode(r, listed),
    approval_id: r.id,
    title: r.title || r.tool_name || null,
    tool_name: r.tool_name || null,
    created_at: r.created_at || null,
  }));
  if (otherRow)
    return {
      success: false,
      error: "approval_not_bound",
      candidates,
      claim_execution: false,
      instruction_for_carmen:
        'הבקשה שביקשת לבצע אינה הבקשה של המשתמש בשיחה הזו, ולכן לא בוצעה. בקשה אחרת מאושרת רק כשהמשתמש עונה "כן" ואחריו הקוד שלה. אסור לכתוב שבוצעה פעולה.',
      guardrail: "לא בוצע כלום.",
    };
  return {
    success: false,
    error:
      pick?.kind === "forbidden"
        ? pick.reason || "forbidden"
        : pick?.kind === "ambiguous"
          ? "ambiguous_approval"
          : pick?.kind === "no_identity"
            ? "no_identity"
            : "no_bound_approval",
    candidates,
    claim_execution: false,
    instruction_for_carmen: buildApprovalPickPromptRule(pick, { nowMs }).trim(),
    guardrail:
      'לא בוצע כלום. בקשה של משתמש אחר או משיחה אחרת מאושרת רק כשהמשתמש עונה "כן" ואחריו הקוד, או במסך האישורים.',
  };
}
