import { assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { namesBrain } from "./stored-pick.ts";

describe("namesBrain", () => {
  it("is true for a brain the request names, Carmen's own included", () => {
    for (const brain_slug of ["groq", "internal"]) {
      assertStrictEquals(namesBrain({ brain_slug }), true);
    }
  });

  it("is false without a slug, and for a value that is no slug", () => {
    assertStrictEquals(namesBrain({}), false);
    for (const brain_slug of [undefined, null, "", 7, {}]) {
      assertStrictEquals(namesBrain({ brain_slug }), false);
    }
  });
});
