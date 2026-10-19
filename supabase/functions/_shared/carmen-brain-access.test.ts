import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedRoutes,
  brainLevel,
  carmenEnabledFor,
} from "./carmen-brain-access.ts";

const ana = {
  enabled: true,
  brain_access: { internal: "full", cursor: "bugfix", junk: "admin" },
};

test("users without a permissions row keep full access", () => {
  assert.equal(brainLevel(null, "cursor"), "full");
  assert.equal(carmenEnabledFor(null), true);
});

test("a row limits the user to the brains it lists", () => {
  assert.equal(brainLevel(ana, "internal"), "full");
  assert.equal(brainLevel(ana, "cursor"), "bugfix");
  assert.equal(brainLevel(ana, "claude"), null);
  assert.equal(brainLevel(ana, "junk"), null);
  assert.deepEqual(
    allowedRoutes(
      [{ slug: "internal" }, { slug: "cursor" }, { slug: "claude" }],
      ana,
    ).map((r) => r.slug),
    ["internal", "cursor"],
  );
});

test("disabled rows and rows with no brains block Carmen", () => {
  assert.equal(carmenEnabledFor({ ...ana, enabled: false }), false);
  assert.equal(brainLevel({ ...ana, enabled: false }, "internal"), null);
  assert.equal(carmenEnabledFor({ enabled: true, brain_access: {} }), false);
});
