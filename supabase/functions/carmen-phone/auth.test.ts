import { assertEquals } from "jsr:@std/assert@1";
import { hmacSha256Hex } from "../_shared/security.ts";
import { elevenLabsSignatureOk, sharedSecretOk } from "./auth.ts";

Deno.test("the shared secret must match exactly", () => {
  assertEquals(sharedSecretOk("s3cret", "s3cret"), true);
  assertEquals(sharedSecretOk("wrong", "s3cret"), false);
  assertEquals(sharedSecretOk(null, "s3cret"), false);
  assertEquals(sharedSecretOk("s3cret", undefined), false);
});

Deno.test(
  "a post-call signature is checked against body, time and secret",
  async () => {
    const body = '{"type":"post_call_transcription"}';
    const t = 1_800_000_000;
    const v0 = await hmacSha256Hex("whsec", `${t}.${body}`);
    const header = `t=${t},v0=${v0}`;
    assertEquals(
      await elevenLabsSignatureOk(body, header, "whsec", t + 60),
      true,
    );
    assertEquals(
      await elevenLabsSignatureOk(body + " ", header, "whsec", t),
      false,
    );
    assertEquals(await elevenLabsSignatureOk(body, header, "other", t), false);
    assertEquals(
      await elevenLabsSignatureOk(body, header, "whsec", t + 3600),
      false,
    );
    assertEquals(
      await elevenLabsSignatureOk(body, "garbage", "whsec", t),
      false,
    );
  },
);
