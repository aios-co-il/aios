// Keeps the outgoing webhook from reaching internal hosts.

/**
 * Rejects non-http(s) URLs and internal hosts by name or IP literal.
 * A public DNS name that resolves to a private IP still passes: the check
 * does not resolve DNS. Edge functions run on Supabase's network, not ours,
 * so that path cannot reach internal services.
 */
export function isAllowedOutboundUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  )
    return false;
  // IPv6 literals: block loopback, unspecified, unique-local and link-local.
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return false;
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(host)) return false;
    if (host.startsWith("::ffff:")) return false;
    return true;
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
      return false;
  }
  return true;
}
