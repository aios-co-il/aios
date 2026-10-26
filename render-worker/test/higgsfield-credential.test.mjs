import { expect, test } from "vitest";
import { higgsfieldCredential } from "../src/providers/higgsfield-credential.mjs";

const copied = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:secret-part";

test("a copied id:secret is sent as-is even when the id field is also filled", () => {
  expect(
    higgsfieldCredential("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", copied),
  ).toBe(copied);
  expect(higgsfieldCredential("other-id", copied)).toBe(copied);
  expect(higgsfieldCredential("", copied)).toBe(copied);
});

test("two separate parts are still joined", () => {
  expect(higgsfieldCredential("a", "b")).toBe("a:b");
});

test("one side without a colon is not a credential", () => {
  expect(higgsfieldCredential("a", "")).toBe("");
  expect(higgsfieldCredential("", "b")).toBe("");
});
