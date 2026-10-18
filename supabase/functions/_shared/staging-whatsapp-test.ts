/** Staging-only exception to the outbound guard: WhatsApp test sends to the
 * numbers in the Staging secret STAGING_ALLOWED_PHONE_NUMBERS. Unset = blocked.
 * Groups, other numbers and unparseable bodies are always blocked.
 */

type FetchInput = string | URL | Request;

/** Digits-only numbers from a comma/space separated list. */
export function parseTestNumbers(raw: string | undefined | null): string[] {
  return (raw || "")
    .split(/[\s,]+/)
    .map((item) => item.replace(/\D/g, ""))
    .filter((item) => item.length >= 8);
}

export function envTestNumbers(): string[] {
  const deno = (
    globalThis as { Deno?: { env: { get(key: string): string | undefined } } }
  ).Deno;
  return parseTestNumbers(deno?.env.get("STAGING_ALLOWED_PHONE_NUMBERS"));
}

/** Recipient field for a reviewed WhatsApp send endpoint, else null. */
export function whatsappSendRecipientField(
  url: string,
  method: string,
): string | null {
  if (method.toUpperCase() !== "POST") {
    return null;
  }
  const target = new URL(url);
  if (target.search) {
    return null;
  }
  const greenSend =
    /^\/waInstance\d+\/(sendMessage|sendFileByUrl|sendFileByUpload)\/[^/]+$/;
  if (
    target.hostname === "api.green-api.com" &&
    greenSend.test(target.pathname)
  ) {
    return "chatId";
  }
  // Per-instance upload host: https://{first 4 digits of idInstance}.media.greenapi.com
  const media = /^(\d{4})\.media\.greenapi\.com$/.exec(target.hostname);
  const upload = /^\/waInstance(\d+)\/sendFileByUpload\/[^/]+$/.exec(
    target.pathname,
  );
  if (media && upload && upload[1].startsWith(media[1])) {
    return "chatId";
  }
  if (
    target.hostname === "whatsappgw-pzpyrrww.manus.space" &&
    /^\/api\/v1\/instances\/[^/]+\/send\/(text|image|file)$/.test(
      target.pathname,
    )
  ) {
    return "to";
  }
  if (
    target.hostname === "graph.facebook.com" &&
    /^\/v\d+(\.\d+)?\/\d+\/messages$/.test(target.pathname)
  ) {
    return "to";
  }
  return null;
}

/** Exact direct-chat match only: no groups, no suffix matching. */
export function isTestRecipient(
  value: unknown,
  testNumbers: string[],
): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^\+?(\d+)(@c\.us|@s\.whatsapp\.net)?$/.exec(value.trim());
  return match !== null && testNumbers.includes(match[1]);
}

async function readRecipient(
  input: FetchInput,
  init: RequestInit | undefined,
  field: string,
): Promise<unknown> {
  try {
    let body: unknown = init?.body;
    if (body === undefined && input instanceof Request) {
      body = await input.clone().text();
    }
    if (body instanceof FormData || body instanceof URLSearchParams) {
      const values = body.getAll(field);
      return values.length === 1 ? values[0] : null;
    }
    if (typeof body !== "string") {
      return null;
    }
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    if ("groupId" in parsed || "recipients" in parsed) {
      return null;
    }
    return (parsed as Record<string, unknown>)[field];
  } catch {
    return null;
  }
}

export async function whatsappTestSendAllowed(
  input: FetchInput,
  init: RequestInit | undefined,
  testNumbers: string[],
): Promise<boolean> {
  if (testNumbers.length === 0) {
    return false;
  }
  const url =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
  const method =
    init?.method || (input instanceof Request ? input.method : "GET");
  const field = whatsappSendRecipientField(url, method);
  if (!field) {
    return false;
  }
  return isTestRecipient(await readRecipient(input, init, field), testNumbers);
}
