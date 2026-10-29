/** Split typed contacts (comma / semicolon / whitespace / new line), deduped. */
export function parseManualContacts(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];
}

/** True when the email body has text or an image (an empty editor emits `<p></p>`). */
export function emailBodyHasContent(bodyHtml: string): boolean {
  return (
    bodyHtml.replace(/<[^>]*>|&nbsp;/g, "").trim().length > 0 ||
    /<img\b/i.test(bodyHtml)
  );
}
