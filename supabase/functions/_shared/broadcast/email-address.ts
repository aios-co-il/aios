// Typed contact lists (wizard "manual" audience, test-send addresses).
// Pure: shared by edge functions and the frontend.

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** True for a plain `local@domain.tld` address (no display name). */
export function isEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value);
}

/** Split typed contacts on commas, semicolons, spaces and new lines; trimmed and deduped. */
export function splitContacts(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];
}
