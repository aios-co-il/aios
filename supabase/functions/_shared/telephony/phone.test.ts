import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhone, phoneMatchKey } from "./phone.ts";

test("normalizePhone handles Israeli formats", () => {
  assert.equal(normalizePhone("+972-50-123-4567"), "0501234567");
  assert.equal(normalizePhone("501234567"), "0501234567");
  assert.equal(normalizePhone("050 123 4567"), "0501234567");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

// Same cases as the SQL public.phone_match_key, which must agree.
test("phoneMatchKey ignores formatting and country code", () => {
  for (const p of [
    "052-987-6543",
    "+972 52 987 6543",
    "972529876543",
    "529876543",
  ])
    assert.equal(phoneMatchKey(p), "529876543", p);
  for (const p of ["03-555-1234", "+972-3-555-1234", "035551234"])
    assert.equal(phoneMatchKey(p), "035551234", p);
  assert.equal(phoneMatchKey("123"), null);
  assert.equal(phoneMatchKey("9721234"), null);
  assert.notEqual(phoneMatchKey("052-987-6544"), "529876543");
});
