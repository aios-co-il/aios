/**
 * Base URLs of OpenAI-compatible chat APIs. The server fetches them, so only
 * public https hosts pass.
 */

/** Trims the URL and drops a trailing slash or /chat/completions. */
export function normalizeBaseUrl(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "");
}

/** Only public https endpoints. */
export function baseUrlProblem(raw: string): string | null {
  const url = normalizeBaseUrl(raw);
  if (!url) return "Base URL is required";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Base URL is not a valid URL";
  }
  if (parsed.protocol !== "https:") return "Base URL must use https";
  if (parsed.username || parsed.password)
    return "Base URL must not contain credentials";
  if (isPrivateHost(parsed.hostname)) return "Base URL must be a public host";
  return null;
}

/** The chat completions endpoint under a base URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

/** Blocks obvious internal targets; the server fetches this URL. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  )
    return true;
  if (h.includes(":"))
    return (
      h === "::" ||
      h === "::1" ||
      /^f[cd][0-9a-f]{0,2}:/.test(h) ||
      h.startsWith("fe80:") ||
      h.startsWith("::ffff:")
    );
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
