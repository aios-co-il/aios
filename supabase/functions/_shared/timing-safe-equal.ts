/** Constant-time string comparison for secrets such as the service-role key.
 * Uses Deno's `crypto.subtle.timingSafeEqual` when present, otherwise an
 * XOR-accumulating loop that does not exit early. */

/** `crypto.subtle`, or a stand-in in tests. */
type Subtle = object | undefined;

function subtleEqual(subtle: Subtle, a: Uint8Array, b: Uint8Array) {
  if (!subtle || !("timingSafeEqual" in subtle)) return null;
  const fn = subtle.timingSafeEqual;
  if (typeof fn !== "function") return null;
  return fn.call(subtle, a, b) === true;
}

export function timingSafeEqualStr(
  a: string,
  b: string,
  subtle: Subtle = globalThis.crypto?.subtle,
): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  const native = subtleEqual(subtle, x, y);
  if (native !== null) return native;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** True when `token` is the (non-empty) service-role key. */
export function isServiceKey(token: string, serviceKey: string): boolean {
  return !!token && !!serviceKey && timingSafeEqualStr(token, serviceKey);
}
