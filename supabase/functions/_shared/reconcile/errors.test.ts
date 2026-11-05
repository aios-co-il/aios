import { assert, assertFalse } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { redactSecrets } from "./errors.ts";

describe("redactSecrets", () => {
  it("removes tokens from URLs, bearer headers and bare tokens", () => {
    const out = redactSecrets(
      "error sending request for url (https://graph.facebook.com/v21.0/act_1/insights?access_token=EAAB1234567890abcdefghijklmnop&limit=500): Bearer ya29.a0AfH6SMB and EAAG99999999999999999999999",
    );
    assertFalse(out.includes("EAAB1234567890"));
    assertFalse(out.includes("ya29.a0"));
    assertFalse(out.includes("EAAG9999"));
    assert(out.includes("graph.facebook.com/v21.0/act_1/insights?[redacted]"));
  });
});
