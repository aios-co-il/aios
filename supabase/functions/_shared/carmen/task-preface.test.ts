import assert from "node:assert/strict";
import test from "node:test";
import { withTaskPreface } from "./task-preface.ts";

const cursor = {
  route_type: "direct_channel",
  config: { profile: { displayName: "Dev Lead" } },
};

test("an external brain gets its profile, then the skin, then the message", () => {
  const out = withTaskPreface(cursor, "SKIN", "fix the login");
  assert.ok(out.startsWith("[Agent profile set in AIOS]"));
  assert.ok(out.indexOf("Dev Lead") < out.indexOf("SKIN"));
  assert.ok(out.endsWith("---\n\nfix the login"));
});

test("internal brain and empty prefaces leave the message unchanged", () => {
  assert.equal(
    withTaskPreface(
      { route_type: "internal", config: cursor.config },
      "S",
      "hi",
    ),
    "hi",
  );
  assert.equal(
    withTaskPreface({ route_type: "direct_channel" }, "", "hi"),
    "hi",
  );
});

test("parliament gets the skin but no single agent's profile", () => {
  const out = withTaskPreface(
    { route_type: "parliament", config: cursor.config },
    "SKIN",
    "hi",
  );
  assert.equal(out, "SKIN\n\n---\n\nhi");
});
