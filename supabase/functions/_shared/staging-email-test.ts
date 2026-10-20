/** Staging-only exception to the outbound guard: Resend email sends where
 * every recipient (to, cc, bcc) is listed in the Staging secret
 * STAGING_ALLOWED_EMAILS. Unset = blocked. Batch sends, unparseable bodies
 * and any recipient outside the list are always blocked.
 */

type FetchInput = string | URL | Request;

/** Lower-cased addresses from a comma/space separated list. */
export function parseTestEmails(raw: string | undefined | null): string[] {
  return (raw || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item));
}

export function envTestEmails(): string[] {
  const deno = (
    globalThis as { Deno?: { env: { get(key: string): string | undefined } } }
  ).Deno;
  return parseTestEmails(deno?.env.get("STAGING_ALLOWED_EMAILS"));
}

/** Only the single-send endpoint; /emails/batch and everything else stay blocked. */
export function isResendSend(url: string, method: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const target = new URL(url);
  return (
    target.protocol === "https:" &&
    target.hostname === "api.resend.com" &&
    target.pathname === "/emails" &&
    !target.search
  );
}

/** "Name <a@b.co>" or "a@b.co" → "a@b.co"; anything else → null. */
function addressOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /<([^<>\s]+)>\s*$/.exec(value.trim());
  const addr = (m ? m[1] : value).trim().toLowerCase();
  return /^[^@\s<>,]+@[^@\s<>,]+$/.test(addr) ? addr : null;
}

function listOf(value: unknown): unknown[] | null {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : null;
}

export async function emailTestSendAllowed(
  input: FetchInput,
  init: RequestInit | undefined,
  testEmails: string[],
): Promise<boolean> {
  if (testEmails.length === 0) return false;
  const url =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
  const method =
    init?.method || (input instanceof Request ? input.method : "GET");
  if (!isResendSend(url, method)) return false;
  try {
    let body: unknown = init?.body;
    if (body === undefined && input instanceof Request) {
      body = await input.clone().text();
    }
    if (typeof body !== "string") return false;
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const recipients: unknown[] = [];
    for (const field of ["to", "cc", "bcc"]) {
      const values = listOf((parsed as Record<string, unknown>)[field]);
      if (values === null) return false;
      recipients.push(...values);
    }
    if (recipients.length === 0) return false;
    return recipients.every((r) => {
      const addr = addressOf(r);
      return addr !== null && testEmails.includes(addr);
    });
  } catch {
    return false;
  }
}
