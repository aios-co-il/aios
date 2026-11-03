// Unpadded base64url, as JWTs and the OAuth state use it.

/** Bytes as unpadded base64url. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Bytes from unpadded base64url. */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** UTF-8 text from unpadded base64url. */
export function base64UrlDecode(text: string): string {
  return new TextDecoder().decode(base64UrlToBytes(text));
}
