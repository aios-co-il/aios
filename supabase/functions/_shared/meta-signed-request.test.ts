import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import {
  base64UrlDecode,
  hmacSha256,
  parseSignedRequest,
  timingSafeEqual,
} from "./meta-signed-request.ts";

const SECRET = "test-app-secret";

function b64url(bytes: Uint8Array | string): string {
  return Buffer.from(bytes).toString("base64url");
}

async function sign(
  payload: Record<string, unknown>,
  secret = SECRET,
): Promise<string> {
  const encodedPayload = b64url(JSON.stringify(payload));
  const signature = await hmacSha256(secret, encodedPayload);
  return `${b64url(signature)}.${encodedPayload}`;
}

const PAYLOAD = {
  algorithm: "HMAC-SHA256",
  issued_at: 1761130000,
  user_id: "1234567890",
};

test("valid signed_request is accepted and decoded", async () => {
  const parsed = await parseSignedRequest(await sign(PAYLOAD), SECRET);
  assert.deepEqual(parsed, PAYLOAD);
});

test("lower-case algorithm value is accepted", async () => {
  const parsed = await parseSignedRequest(
    await sign({ ...PAYLOAD, algorithm: "hmac-sha256" }),
    SECRET,
  );
  assert.equal(parsed?.user_id, "1234567890");
});

test("tampered signature is rejected", async () => {
  const signed = await sign(PAYLOAD);
  const [sig, payload] = signed.split(".");
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(await parseSignedRequest(`${flipped}.${payload}`, SECRET), null);
});

test("wrong secret is rejected", async () => {
  const signed = await sign(PAYLOAD, "another-secret");
  assert.equal(await parseSignedRequest(signed, SECRET), null);
});

test("tampered payload is rejected", async () => {
  const signed = await sign(PAYLOAD);
  const [sig] = signed.split(".");
  const other = b64url(JSON.stringify({ ...PAYLOAD, user_id: "999" }));
  assert.equal(await parseSignedRequest(`${sig}.${other}`, SECRET), null);
});

test("missing dot, empty parts and garbage are rejected", async () => {
  assert.equal(await parseSignedRequest("", SECRET), null);
  assert.equal(await parseSignedRequest("nodot", SECRET), null);
  assert.equal(await parseSignedRequest(".payload", SECRET), null);
  assert.equal(await parseSignedRequest("sig.", SECRET), null);
  assert.equal(await parseSignedRequest("not base64!.%%%", SECRET), null);
  assert.equal(await parseSignedRequest("YWJj.ZGVm", SECRET), null);
});

test("correctly signed but non-JSON or non-object payload is rejected", async () => {
  const sigFor = async (encodedPayload: string) =>
    `${b64url(await hmacSha256(SECRET, encodedPayload))}.${encodedPayload}`;
  assert.equal(
    await parseSignedRequest(await sigFor(b64url("{")), SECRET),
    null,
  );
  assert.equal(
    await parseSignedRequest(await sigFor(b64url('"text"')), SECRET),
    null,
  );
  assert.equal(
    await parseSignedRequest(await sigFor(b64url("42")), SECRET),
    null,
  );
  assert.equal(
    await parseSignedRequest(await sigFor(b64url("null")), SECRET),
    null,
  );
  assert.equal(
    await parseSignedRequest(
      await sigFor(b64url('[{"algorithm":"HMAC-SHA256"}]')),
      SECRET,
    ),
    null,
  );
});

test("missing or foreign algorithm is rejected", async () => {
  const { algorithm: _omit, ...withoutAlgorithm } = PAYLOAD;
  assert.equal(
    await parseSignedRequest(await sign(withoutAlgorithm), SECRET),
    null,
  );
  assert.equal(
    await parseSignedRequest(await sign({ ...PAYLOAD, algorithm: "" }), SECRET),
    null,
  );
  assert.equal(
    await parseSignedRequest(
      await sign({ ...PAYLOAD, algorithm: "HMAC-SHA1" }),
      SECRET,
    ),
    null,
  );
  assert.equal(
    await parseSignedRequest(
      await sign({ ...PAYLOAD, algorithm: 256 }),
      SECRET,
    ),
    null,
  );
});

test("base64url and plain base64 both decode", () => {
  // 0xfb 0xff 0xbf encodes to "+/+/" in base64 and "-_-_" in base64url.
  const expected = new Uint8Array([0xfb, 0xff, 0xbf]);
  assert.deepEqual(base64UrlDecode("-_-_"), expected);
  assert.deepEqual(base64UrlDecode("+/+/"), expected);
  // Padding is optional.
  assert.deepEqual(base64UrlDecode("YQ"), new Uint8Array([0x61]));
  assert.deepEqual(base64UrlDecode("YQ=="), new Uint8Array([0x61]));
  assert.deepEqual(base64UrlDecode("YWI"), new Uint8Array([0x61, 0x62]));
  assert.deepEqual(base64UrlDecode("YWI="), new Uint8Array([0x61, 0x62]));
});

test("UTF-8 payload survives the round trip", async () => {
  const payload = { ...PAYLOAD, name: "ישראל ישראלי – café ✓" };
  const parsed = await parseSignedRequest(await sign(payload), SECRET);
  assert.equal(parsed?.name, payload.name);
});

test("timingSafeEqual compares bytes", () => {
  const a = new Uint8Array([1, 2, 3]);
  assert.equal(timingSafeEqual(a, new Uint8Array([1, 2, 3])), true);
  assert.equal(timingSafeEqual(a, new Uint8Array([1, 2, 4])), false);
  assert.equal(timingSafeEqual(a, new Uint8Array([1, 2])), false);
  assert.equal(timingSafeEqual(new Uint8Array(), new Uint8Array()), true);
});
