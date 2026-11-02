import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { Buffer } from "node:buffer";
import {
  base64UrlDecode,
  hmacSha256,
  parseSignedRequest,
  timingSafeEqual,
} from "./signed-request.ts";

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

Deno.test(
  "parseSignedRequest: valid signed_request is accepted and decoded",
  async () => {
    const parsed = await parseSignedRequest(await sign(PAYLOAD), SECRET);
    assertEquals(parsed, PAYLOAD);
  },
);

Deno.test(
  "parseSignedRequest: lower-case algorithm value is accepted",
  async () => {
    const parsed = await parseSignedRequest(
      await sign({ ...PAYLOAD, algorithm: "hmac-sha256" }),
      SECRET,
    );
    assertStrictEquals(parsed?.user_id, "1234567890");
  },
);

Deno.test("parseSignedRequest: tampered signature is rejected", async () => {
  const signed = await sign(PAYLOAD);
  const [sig, payload] = signed.split(".");
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assertStrictEquals(
    await parseSignedRequest(`${flipped}.${payload}`, SECRET),
    null,
  );
});

Deno.test("parseSignedRequest: wrong secret is rejected", async () => {
  const signed = await sign(PAYLOAD, "another-secret");
  assertStrictEquals(await parseSignedRequest(signed, SECRET), null);
});

Deno.test("parseSignedRequest: tampered payload is rejected", async () => {
  const signed = await sign(PAYLOAD);
  const [sig] = signed.split(".");
  const other = b64url(JSON.stringify({ ...PAYLOAD, user_id: "999" }));
  assertStrictEquals(await parseSignedRequest(`${sig}.${other}`, SECRET), null);
});

Deno.test(
  "parseSignedRequest: missing dot, empty parts and garbage are rejected",
  async () => {
    assertStrictEquals(await parseSignedRequest("", SECRET), null);
    assertStrictEquals(await parseSignedRequest("nodot", SECRET), null);
    assertStrictEquals(await parseSignedRequest(".payload", SECRET), null);
    assertStrictEquals(await parseSignedRequest("sig.", SECRET), null);
    assertStrictEquals(
      await parseSignedRequest("not base64!.%%%", SECRET),
      null,
    );
    assertStrictEquals(await parseSignedRequest("YWJj.ZGVm", SECRET), null);
  },
);

Deno.test(
  "parseSignedRequest: correctly signed but non-JSON or non-object payload is rejected",
  async () => {
    const sigFor = async (encodedPayload: string) =>
      `${b64url(await hmacSha256(SECRET, encodedPayload))}.${encodedPayload}`;
    assertStrictEquals(
      await parseSignedRequest(await sigFor(b64url("{")), SECRET),
      null,
    );
    assertStrictEquals(
      await parseSignedRequest(await sigFor(b64url('"text"')), SECRET),
      null,
    );
    assertStrictEquals(
      await parseSignedRequest(await sigFor(b64url("42")), SECRET),
      null,
    );
    assertStrictEquals(
      await parseSignedRequest(await sigFor(b64url("null")), SECRET),
      null,
    );
    assertStrictEquals(
      await parseSignedRequest(
        await sigFor(b64url('[{"algorithm":"HMAC-SHA256"}]')),
        SECRET,
      ),
      null,
    );
  },
);

Deno.test(
  "parseSignedRequest: missing or foreign algorithm is rejected",
  async () => {
    const { algorithm: _omit, ...withoutAlgorithm } = PAYLOAD;
    assertStrictEquals(
      await parseSignedRequest(await sign(withoutAlgorithm), SECRET),
      null,
    );
    assertStrictEquals(
      await parseSignedRequest(
        await sign({ ...PAYLOAD, algorithm: "" }),
        SECRET,
      ),
      null,
    );
    assertStrictEquals(
      await parseSignedRequest(
        await sign({ ...PAYLOAD, algorithm: "HMAC-SHA1" }),
        SECRET,
      ),
      null,
    );
    assertStrictEquals(
      await parseSignedRequest(
        await sign({ ...PAYLOAD, algorithm: 256 }),
        SECRET,
      ),
      null,
    );
  },
);

Deno.test(
  "parseSignedRequest: UTF-8 payload survives the round trip",
  async () => {
    const payload = { ...PAYLOAD, name: "ישראל ישראלי – café ✓" };
    const parsed = await parseSignedRequest(await sign(payload), SECRET);
    assertStrictEquals(parsed?.name, payload.name);
  },
);

Deno.test("base64UrlDecode: base64url and plain base64 both decode", () => {
  // 0xfb 0xff 0xbf encodes to "+/+/" in base64 and "-_-_" in base64url.
  const expected = new Uint8Array([0xfb, 0xff, 0xbf]);
  assertEquals(base64UrlDecode("-_-_"), expected);
  assertEquals(base64UrlDecode("+/+/"), expected);
  // Padding is optional.
  assertEquals(base64UrlDecode("YQ"), new Uint8Array([0x61]));
  assertEquals(base64UrlDecode("YQ=="), new Uint8Array([0x61]));
  assertEquals(base64UrlDecode("YWI"), new Uint8Array([0x61, 0x62]));
  assertEquals(base64UrlDecode("YWI="), new Uint8Array([0x61, 0x62]));
});

Deno.test("timingSafeEqual: compares bytes", () => {
  const a = new Uint8Array([1, 2, 3]);
  assertStrictEquals(timingSafeEqual(a, new Uint8Array([1, 2, 3])), true);
  assertStrictEquals(timingSafeEqual(a, new Uint8Array([1, 2, 4])), false);
  assertStrictEquals(timingSafeEqual(a, new Uint8Array([1, 2])), false);
  assertStrictEquals(timingSafeEqual(new Uint8Array(), new Uint8Array()), true);
});
