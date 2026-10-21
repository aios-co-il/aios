import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhone, phoneLikePattern, phoneMatchKey } from "./phone.ts";

test("normalizePhone handles Israeli formats", () => {
  assert.equal(normalizePhone("+972-50-123-4567"), "0501234567");
  assert.equal(normalizePhone("501234567"), "0501234567");
  assert.equal(normalizePhone("050 123 4567"), "0501234567");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

test("phoneLikePattern matches stored phones with separators", () => {
  const key = phoneMatchKey("0529876543")!;
  const re = new RegExp("^" + phoneLikePattern(key).replace(/%/g, ".*") + "$");
  for (const stored of ["052-987-6543", "+972 52 987 6543", "972529876543"])
    assert.ok(re.test(stored), stored);
  assert.equal(phoneMatchKey("+972-52-987-6543"), key);
  assert.notEqual(phoneMatchKey("052-987-6544"), key);
  const landline = phoneMatchKey("03-555-1234")!;
  const landRe = new RegExp(
    "^" + phoneLikePattern(landline).replace(/%/g, ".*") + "$",
  );
  assert.ok(landRe.test("+972-3-555-1234"));
  assert.equal(phoneMatchKey("+972-3-555-1234"), landline);
});
