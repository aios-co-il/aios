/**
 * Pure chatId resolution for send-green-api-file (Green API only — not Manus).
 * Safe for unit tests; no network / Production writes.
 */

// Per attempt. Two attempts (instance media host, then legacy host) must fit
// inside the browser's SEND_REPORT_CLIENT_TIMEOUT_MS.
export const GREEN_API_UPSTREAM_TIMEOUT_MS = 25_000;
export const CHAT_MESSAGES_INSERT_TIMEOUT_MS = 15_000;
export const SEND_REPORT_CLIENT_TIMEOUT_MS = 60_000;

/** Same phone normalization as legacy send-green-api-file when groupChatId is absent. */
export function normalizeGreenApiPhoneChatId(phoneNumber, countryCode = "972") {
  const originalPhone = String(phoneNumber || "");
  let digits = originalPhone.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  const defaultCountryCode = String(countryCode || "972");
  if (!digits.startsWith(defaultCountryCode)) {
    digits = digits.startsWith("0")
      ? defaultCountryCode + digits.slice(1)
      : defaultCountryCode + digits;
  }
  return { chatId: `${digits}@c.us`, digits };
}

/** Reject bare/invalid phone chat ids like 972@c.us (country code only). */
export function isValidGreenApiChatId(chatId) {
  if (!chatId || typeof chatId !== "string") return false;
  if (chatId.endsWith("@g.us")) {
    return chatId.length > 10;
  }
  if (chatId.endsWith("@c.us")) {
    const digits = chatId.replace(/@c\.us$/, "");
    return /^\d{8,15}$/.test(digits);
  }
  return false;
}

/**
 * Resolve outbound Green API chat target.
 * Group chat id wins; otherwise phone fallback; never invent 972@c.us.
 */
export function resolveGreenApiChatTarget({
  groupId,
  groupChatId,
  phoneNumber,
  countryCode = "972",
}) {
  if (groupChatId) {
    const chatId = String(groupChatId);
    if (!isValidGreenApiChatId(chatId)) {
      return {
        ok: false,
        error: "invalid_group_chat_id",
        message: "קבוצת הוואטסאפ שנבחרה אינה תקינה (חסר מזהה צ׳אט)",
      };
    }
    return { ok: true, chatId, via: "group" };
  }

  if (phoneNumber && String(phoneNumber).replace(/[^0-9]/g, "").length > 0) {
    const { chatId, digits } = normalizeGreenApiPhoneChatId(
      phoneNumber,
      countryCode,
    );
    if (!isValidGreenApiChatId(chatId)) {
      return {
        ok: false,
        error: "invalid_phone",
        message: "מספר הטלפון אינו תקין",
      };
    }
    return {
      ok: true,
      chatId,
      via: groupId ? "phone_fallback" : "phone",
      digits,
    };
  }

  if (groupId) {
    return {
      ok: false,
      error: "missing_group_chat_id",
      message:
        "לקבוצה שנבחרה חסר מזהה וואטסאפ — בחר קבוצה אחרת או הזן מספר טלפון",
    };
  }

  return {
    ok: false,
    error: "missing_recipient",
    message: "יש לבחור קבוצה או להזין מספר טלפון",
  };
}

/**
 * Group lookup must run whenever groupId is present — not only in an else-if
 * after clientId/leadId tenant resolution (that skipped group_chat_id).
 */
export function shouldLookupGroupChatId({ groupId }) {
  return Boolean(groupId);
}

/**
 * Payload shape SendReportDialog builds for WhatsApp.
 * Group preferred; phone still sent as fallback when both are filled.
 */
export function buildSendReportWhatsAppFields({
  tenantId,
  selectedGroupId,
  directPhone,
  clientId,
}) {
  const hasGroup = Boolean(selectedGroupId && selectedGroupId !== "__none__");
  const phone =
    directPhone && String(directPhone).trim()
      ? String(directPhone).trim()
      : null;
  return {
    tenantId,
    groupId: hasGroup ? selectedGroupId : null,
    phoneNumber: phone,
    clientId: clientId || null,
    fileType: "image",
  };
}

/** Race a promise against a timeout; abort-friendly for fetch. */
export function withTimeout(promise, ms, label = "operation") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label}_timeout`);
      err.name = "TimeoutError";
      err.code = "timeout";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Client-side: map AbortError / TimeoutError to a Hebrew toast message. */
export function clientSendTimeoutMessage(err) {
  const name = err?.name || "";
  const msg = String(err?.message || "");
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    msg.includes("timeout")
  ) {
    return "שליחת הוואטסאפ ארכה יותר מדי — נסה שוב או בדוק את חיבור Green API";
  }
  return null;
}

/**
 * Upload endpoints for sendFileByUpload, in the order to try them.
 * Green API serves uploads from a per-instance media host
 * (https://{first 4 digits of idInstance}.media.greenapi.com). The shared
 * api.green-api.com host timed out / dropped TLS for report uploads, so it is
 * only the fallback. A stored settings.media_url wins when present.
 */
export function greenApiUploadEndpoints(instanceId, apiToken, mediaUrl = "") {
  const id = String(instanceId || "").replace(/\D/g, "");
  const path = `/waInstance${id}/sendFileByUpload/${apiToken}`;
  const hosts = [];
  const custom = String(mediaUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (/^https:\/\//.test(custom)) hosts.push(custom);
  if (id.length >= 4)
    hosts.push(`https://${id.slice(0, 4)}.media.greenapi.com`);
  hosts.push("https://api.green-api.com");
  return [...new Set(hosts)].map((host) => `${host}${path}`);
}
