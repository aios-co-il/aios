/**
 * Which addresses Carmen may fetch on a user's behalf. Plain TypeScript, no Deno APIs: only public
 * http(s) hosts on the default ports, never a private, loopback, link-local or metadata address.
 * The pinned fetch in ../public-fetch.ts resolves the host itself and checks every address here.
 */

function parseIPv4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : NaN,
  );
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function ipv4InCidr(ip: number, network: number, bits: number): boolean {
  return ip >>> (32 - bits) === network >>> (32 - bits);
}

function isPrivateIPv4(ip: number): boolean {
  return (
    ipv4InCidr(ip, 0x00000000, 8) ||
    ipv4InCidr(ip, 0x0a000000, 8) ||
    ipv4InCidr(ip, 0x7f000000, 8) ||
    ipv4InCidr(ip, 0xa9fe0000, 16) ||
    ipv4InCidr(ip, 0xac100000, 12) ||
    ipv4InCidr(ip, 0xc0a80000, 16) ||
    ipv4InCidr(ip, 0x64400000, 10) ||
    ipv4InCidr(ip, 0xc0000000, 24) ||
    ipv4InCidr(ip, 0xe0000000, 4) ||
    ipv4InCidr(ip, 0xf0000000, 4)
  );
}

function expandIPv6(host: string): number[] | null {
  let ip = host.toLowerCase().replace(/^\[|\]$/g, "");
  const v4tail = ip.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4tail) {
    const n = parseIPv4(v4tail[1]);
    if (n === null) return null;
    ip = `${ip.slice(0, -v4tail[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  if (ip.includes(".")) return null;
  const sides = ip.split("::");
  if (sides.length > 2) return null;
  const parseSide = (side: string) => (side === "" ? [] : side.split(":"));
  const left = parseSide(sides[0]).map((part) =>
    /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : NaN,
  );
  const right = (sides.length === 2 ? parseSide(sides[1]) : []).map((part) =>
    /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : NaN,
  );
  if (left.some(Number.isNaN) || right.some(Number.isNaN)) return null;
  if (sides.length === 2) {
    const fill = 8 - left.length - right.length;
    if (fill < 0) return null;
    return [...left, ...Array(fill).fill(0), ...right];
  }
  return left.length === 8 ? left : null;
}

function isPrivateIPv6(host: string): boolean {
  const groups = expandIPv6(host);
  if (!groups) return true;
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1)
    return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  const ipv4Mapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;
  if (ipv4Mapped) return isPrivateIPv4(((groups[6] << 16) | groups[7]) >>> 0);
  const ipv4Compatible =
    groups.slice(0, 6).every((group) => group === 0) &&
    groups[6] !== 0 &&
    groups[7] !== 1;
  if (ipv4Compatible)
    return isPrivateIPv4(((groups[6] << 16) | groups[7]) >>> 0);
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const host = address
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  const ipv4 = parseIPv4(host);
  if (ipv4 !== null) return isPrivateIPv4(ipv4);
  if (host.includes(":")) return isPrivateIPv6(host);
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host) return true;
  return (
    host === "localhost" ||
    host === "metadata" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan")
  );
}

export function parsePublicHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed))
    return null;
  let parsed: URL;
  try {
    parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") return null;
  if (isBlockedHostname(parsed.hostname)) return null;
  return parsed;
}

/** Reads a chunked HTTP/1.1 body (the bytes after the header block). */
export function decodeChunked(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let at = 0;
  let total = 0;
  const lineEnd = (from: number) => {
    for (let i = from; i < raw.length - 1; i++)
      if (raw[i] === 13 && raw[i + 1] === 10) return i;
    return -1;
  };
  while (at < raw.length) {
    const end = lineEnd(at);
    if (end < 0) break;
    const size = Number.parseInt(
      new TextDecoder().decode(raw.subarray(at, end)).split(";")[0].trim(),
      16,
    );
    if (!Number.isFinite(size) || size < 0) break;
    if (size === 0) break;
    const start = end + 2;
    const chunk = raw.subarray(start, Math.min(start + size, raw.length));
    parts.push(chunk);
    total += chunk.length;
    at = start + size + 2;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Splits a raw HTTP/1.1 response into status, headers and the decoded body. */
export function parseHttpResponse(raw: Uint8Array): {
  status: number;
  headers: Headers;
  body: Uint8Array;
} | null {
  let split = -1;
  for (let i = 0; i < raw.length - 3; i++) {
    if (
      raw[i] === 13 &&
      raw[i + 1] === 10 &&
      raw[i + 2] === 13 &&
      raw[i + 3] === 10
    ) {
      split = i;
      break;
    }
  }
  if (split < 0) return null;
  const head = new TextDecoder().decode(raw.subarray(0, split));
  const [statusLine, ...lines] = head.split("\r\n");
  const status = Number(statusLine.split(" ")[1]);
  if (!Number.isInteger(status)) return null;
  const headers = new Headers();
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > 0)
      headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  const rest = raw.subarray(split + 4);
  const body = /chunked/i.test(headers.get("transfer-encoding") ?? "")
    ? decodeChunked(rest)
    : rest;
  return { status, headers, body };
}
