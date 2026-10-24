/**
 * Fetches a public web page or image for Carmen. The host is resolved here, every address is
 * checked against the private ranges, and the connection is pinned to the checked address, so a
 * name that later resolves somewhere private (DNS rebinding) cannot reach the internal network.
 * Redirects are followed by hand and re-checked at every hop.
 */

import {
  isBlockedAddress,
  parseHttpResponse,
  parsePublicHttpUrl,
} from "./workshop/public-url.ts";

export interface PublicFetchResult {
  ok: boolean;
  status: number;
  url: string;
  contentType: string;
  bytes: Uint8Array;
  error?: string;
}

const fail = (error: string, url = ""): PublicFetchResult => ({
  ok: false,
  status: 0,
  url,
  contentType: "",
  bytes: new Uint8Array(0),
  error,
});

async function lookupIps(hostname: string): Promise<string[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return [host];
  const resolveDns = (
    Deno as { resolveDns?: (q: string, t: string) => Promise<string[]> }
  ).resolveDns;
  if (typeof resolveDns !== "function") return [];
  const [a, aaaa] = await Promise.all([
    resolveDns(host, "A").catch(() => [] as string[]),
    resolveDns(host, "AAAA").catch(() => [] as string[]),
  ]);
  return [...a, ...aaaa];
}

async function publicTarget(raw: string) {
  const url = parsePublicHttpUrl(raw);
  if (!url) return null;
  const ips = await lookupIps(url.hostname);
  if (ips.length === 0 || ips.some((ip) => isBlockedAddress(ip))) return null;
  return { url, ip: ips[0] };
}

const timeout = (ms: number, label: string) =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(label)), ms),
  );

async function pinnedGet(
  target: { url: URL; ip: string },
  options: { timeoutMs: number; maxBytes: number; accept: string },
) {
  const port = target.url.port
    ? Number(target.url.port)
    : target.url.protocol === "https:"
      ? 443
      : 80;
  const tcp = await Promise.race([
    Deno.connect({ hostname: target.ip, port }),
    timeout(options.timeoutMs, "connect timeout"),
  ]);
  const conn =
    target.url.protocol === "https:"
      ? await Deno.startTls(tcp, {
          hostname: target.url.hostname,
          alpnProtocols: ["http/1.1"],
        })
      : tcp;
  const path = `${target.url.pathname || "/"}${target.url.search}`;
  await conn.write(
    new TextEncoder().encode(
      `GET ${path} HTTP/1.1\r\nHost: ${target.url.host}\r\nUser-Agent: Mozilla/5.0 (compatible; AIOS-Carmen/1.0)\r\nAccept: ${options.accept}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`,
    ),
  );
  const read = async () => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const buffer = new Uint8Array(16_384);
    while (total < options.maxBytes + 65_536) {
      const n = await conn.read(buffer);
      if (n === null) break;
      chunks.push(buffer.slice(0, n));
      total += n;
    }
    const raw = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      raw.set(chunk, at);
      at += chunk.length;
    }
    return raw;
  };
  try {
    const raw = await Promise.race([
      read(),
      timeout(options.timeoutMs, "read timeout"),
    ]);
    return parseHttpResponse(raw);
  } finally {
    try {
      conn.close();
    } catch {
      /* already closed */
    }
  }
}

/** GET a public http(s) URL. Never throws; failures come back in `error`. */
export async function fetchPublic(
  rawUrl: string,
  options: { timeoutMs?: number; maxBytes?: number; accept?: string } = {},
): Promise<PublicFetchResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const accept = options.accept ?? "text/html,application/xhtml+xml,*/*";
  try {
    let target = await publicTarget(rawUrl);
    if (!target) return fail("הכתובת לא ציבורית או לא תקינה", rawUrl);
    for (let hop = 0; hop < 5; hop++) {
      const response = await pinnedGet(target, { timeoutMs, maxBytes, accept });
      if (!response) return fail("תשובה לא תקינה מהאתר", target.url.href);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return fail("הפניה בלי יעד", target.url.href);
        const next = await publicTarget(
          new URL(location, target.url).toString(),
        );
        if (!next) return fail("האתר הפנה לכתובת לא ציבורית", target.url.href);
        target = next;
        continue;
      }
      const ok = response.status >= 200 && response.status < 300;
      return {
        ok,
        status: response.status,
        url: target.url.href,
        contentType: response.headers.get("content-type") ?? "",
        bytes: response.body.slice(0, maxBytes),
        error: ok ? undefined : `האתר החזיר ${response.status}`,
      };
    }
    return fail("יותר מדי הפניות", rawUrl);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "הגישה לאתר נכשלה",
      rawUrl,
    );
  }
}

/** A `fetch`-shaped wrapper so code written against fetch (reference loading) gets the same guard. */
export const publicFetchAsFetch = (async (input: string | URL | Request) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const result = await fetchPublic(url, {
    accept: "image/*,*/*",
    maxBytes: 12_000_000,
  });
  return new Response(result.ok ? (result.bytes as BlobPart) : null, {
    status: result.ok ? result.status : result.status || 502,
    headers: { "content-type": result.contentType },
  });
}) as typeof fetch;
