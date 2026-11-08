import { hmacSha256Hex, timingSafeEqual } from "../_shared/security.ts";

// ElevenLabs signs a post-call webhook within this window; older deliveries are refused.
const SIGNATURE_TOLERANCE_SECS = 30 * 60;

/** Whether a request carries the shared secret ElevenLabs sends in the header (initiation, tools). */
export function sharedSecretOk(
  header: string | null,
  secret: string | undefined,
): boolean {
  return Boolean(secret && header && timingSafeEqual(header, secret));
}

/**
 * Checks an `ElevenLabs-Signature` header (`t=<unix secs>,v0=<hex>`): HMAC-SHA256 of
 * `<t>.<raw body>` with the webhook secret, and a timestamp inside the tolerance.
 */
export async function elevenLabsSignatureOk(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSecs: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !header) {
    return false;
  }
  const parts = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")] as const;
    }),
  );
  const timestamp = Number(parts.get("t"));
  const signature = parts.get("v0") ?? "";
  if (!Number.isFinite(timestamp) || !signature) {
    return false;
  }
  if (Math.abs(nowSecs - timestamp) > SIGNATURE_TOLERANCE_SECS) {
    return false;
  }
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return timingSafeEqual(signature, expected);
}
