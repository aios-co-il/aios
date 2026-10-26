import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { allowedRoutes, brainLevel, carmenEnabledFor } from "./brain-access.ts";

const ana = {
  enabled: true,
  brain_access: { internal: "full", cursor: "bugfix", junk: "admin" },
};

Deno.test("users without a permissions row keep full access", () => {
  assertStrictEquals(brainLevel(null, "cursor"), "full");
  assertStrictEquals(carmenEnabledFor(null), true);
});

Deno.test("a row without brain settings keeps every brain", () => {
  const legacy = { enabled: true, brain_access: null };
  assertStrictEquals(brainLevel(legacy, "cursor"), "full");
  assertStrictEquals(carmenEnabledFor(legacy), true);
  assertStrictEquals(brainLevel({ ...legacy, enabled: false }, "cursor"), null);
});

Deno.test("a row limits the user to the brains it lists", () => {
  assertStrictEquals(brainLevel(ana, "internal"), "full");
  assertStrictEquals(brainLevel(ana, "cursor"), "bugfix");
  assertStrictEquals(brainLevel(ana, "claude"), null);
  assertStrictEquals(brainLevel(ana, "junk"), null);
  assertEquals(
    allowedRoutes(
      [{ slug: "internal" }, { slug: "cursor" }, { slug: "claude" }],
      ana,
    ).map((r) => r.slug),
    ["internal", "cursor"],
  );
});

Deno.test("disabled rows and rows with no brains block Carmen", () => {
  assertStrictEquals(carmenEnabledFor({ ...ana, enabled: false }), false);
  assertStrictEquals(brainLevel({ ...ana, enabled: false }, "internal"), null);
  assertStrictEquals(
    carmenEnabledFor({ enabled: true, brain_access: {} }),
    false,
  );
});
