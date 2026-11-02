const REDACTED = "[redacted]";

/**
 * Credential-shaped text an upstream error can carry. Meta puts the access token in
 * the request URL (first page and every `paging.next`), and Deno's transport errors
 * print that URL in full ("error sending request for url (https://…?access_token=…)").
 * Each pattern skips text it already redacted, so redacting twice changes nothing.
 */
const SECRET_REDACTIONS: Array<[RegExp, string]> = [
  // access_token=…, "refresh_token": "…" and friends, in a query string or JSON.
  [
    /\b(access[_-]token|refresh[_-]token|client[_-]secret|appsecret[_-]proof|fb[_-]exchange[_-]token|developer[_-]token|api[_-]?key|webhook[_-]secret)(["']?\s*[:=]\s*["']?)(?!\[redacted\])[^&\s"',;)}\]]+/gi,
    `$1$2${REDACTED}`,
  ],
  // Any other query string on a URL.
  [
    /(https?:\/\/[^\s?#"'<>()]+)\?(?!\[redacted\])[^\s"'<>)]*/gi,
    `$1?${REDACTED}`,
  ],
  [/\b(Bearer\s+)(?!\[redacted\])[\w.~+/=-]+/gi, `$1${REDACTED}`],
  // Bare Meta (EAA…) and Google (ya29.…) access tokens.
  [/(?<![A-Za-z0-9])EAA[A-Za-z0-9]{20,}/g, REDACTED],
  [/\bya29\.[\w.-]+/g, REDACTED],
];

/** Upstream error text with credentials removed; safe to store or return. */
export function redactSyncError(text: unknown): string {
  // Decode encoded separators first so an encoded token URL matches the rules above.
  let redacted = decodeUrlSeparators(String(text ?? ""));
  for (const [pattern, replacement] of SECRET_REDACTIONS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

/** Percent-encoded separators a URL inside an error can carry (%3D, %3A, %2F…). */
function decodeUrlSeparators(text: string): string {
  return text.replace(/%(2[26F]|3[ADF])/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}
