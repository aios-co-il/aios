import assert from "node:assert/strict";
import test from "node:test";
import { readHistory, readParliamentRequest } from "./request.ts";

test("readParliamentRequest exposes body fields and treats non-objects as empty", () => {
  const body = readParliamentRequest({
    tenant_id: "t1",
    action: "clarify",
    brain_route_id: 7,
  });
  assert.equal(body.tenant_id, "t1");
  assert.equal(body.action, "clarify");
  assert.equal(body.brain_route_id, 7);
  assert.equal(body.content, undefined);
  assert.deepEqual(readParliamentRequest(null), {});
  assert.deepEqual(readParliamentRequest("x"), {});
});

test("readHistory keeps string role/content entries and drops malformed ones", () => {
  const ok = { role: "user", content: "hi" };
  assert.deepEqual(
    readHistory([
      ok,
      null,
      { role: "assistant" },
      { role: 1, content: "x" },
      "s",
    ]),
    [ok],
  );
  assert.deepEqual(readHistory("not-an-array"), []);
  assert.deepEqual(readHistory(undefined), []);
});
