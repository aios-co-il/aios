/**
 * Fetches a public web page or image for Carmen. The host is resolved here, every address is
 * checked against the private ranges, and the connection is pinned to the checked address, so a
 * name that later resolves somewhere private (DNS rebinding) cannot reach the internal network.
 * Redirects are followed by hand and re-checked at every hop.
 */

import {
  bodyProblem,
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

/** Rejects after `ms`; the caller clears it so a finished request leaves no timer behind. */
function deadline(ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return { expired, clear: () => clearTimeout(timer) };
}

const closeQuietly = (conn: { close(): void } | null | undefined) => {
  try {
    conn?.close();
  } catch {
    /* already closed */
  }
};

/** Awaits `work` until the deadline; a connection that arrives after giving up is closed. */
async function withinDeadline<T extends { close(): void }>(
  work: Promise<T>,
  limit: ReturnType<typeof deadline>,
): Promise<T> {
  try {
    return await Promise.race([work, limit.expired]);
  } catch (error) {
    work.then(closeQuietly, () => {});
    throw error;
  }
}

async function pinnedGet(
  target: { url: URL; ip: string },
  options: { timeoutMs: number; maxBytes: number; accept: string },
) {
  const port = target.url.port
    ? Number(target.url.port)
    : target.url.protocol === "https:"
      ? 443
      : 80;
  // One budget for connect, TLS and reading, so a slow handshake cannot stretch the request.
  const limit = deadline(options.timeoutMs, "timeout");
  let tcp: Deno.TcpConn | null = null;
  let conn: Deno.Conn | null = null;
  try {
    tcp = await withinDeadline(
      Deno.connect({ hostname: target.ip, port }),
      limit,
    );
    conn =
      target.url.protocol === "https:"
        ? await withinDeadline(
            Deno.startTls(tcp, {
              hostname: target.url.hostname,
              alpnProtocols: ["http/1.1"],
            }),
            limit,
          )
        : tcp;
    const path = `${target.url.pathname || "/"}${target.url.search}`;
    await Promise.race([
      conn.write(
        new TextEncoder().encode(
          `GET ${path} HTTP/1.1\r\nHost: ${target.url.host}\r\nUser-Agent: Mozilla/5.0 (compatible; AIOS-Carmen/1.0)\r\nAccept: ${options.accept}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`,
        ),
      ),
      limit.expired,
    ]);
    const open = conn;
    const cap = options.maxBytes + HEADER_ALLOWANCE;
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let total = 0;
      const buffer = new Uint8Array(16_384);
      let capped = false;
      while (true) {
        const n = await open.read(buffer);
        if (n === null) break;
        chunks.push(buffer.slice(0, n));
        total += n;
        if (total > cap) {
          capped = true;
          break;
        }
      }
      const raw = new Uint8Array(total);
      let at = 0;
      for (const chunk of chunks) {
        raw.set(chunk, at);
        at += chunk.length;
      }
      return { raw, capped };
    };
    const { raw, capped } = await Promise.race([read(), limit.expired]);
    const response = parseHttpResponse(raw);
    return response ? { ...response, capped } : null;
  } finally {
    limit.clear();
    closeQuietly(conn);
    if (conn !== tcp) closeQuietly(tcp);
  }
}

/** Room for the status line and headers on top of the body limit. */
const HEADER_ALLOWANCE = 65_536;

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
      const incomplete = ok
        ? bodyProblem(response, { maxBytes, capped: response.capped })
        : null;
      if (incomplete) return fail(incomplete, target.url.href);
      return {
        ok,
        status: response.status,
        url: target.url.href,
        contentType: response.headers.get("content-type") ?? "",
        bytes: response.body,
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
