import { assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { keepsDesign } from "./keep-design.ts";

describe("keepsDesign", () => {
  it("follows the call, then what the film chose before", () => {
    assertStrictEquals(keepsDesign({ keep_design: true }, {}), true);
    assertStrictEquals(
      keepsDesign({ keep_design: false }, { keep_design: true }),
      false,
    );
    assertStrictEquals(keepsDesign({}, { keep_design: true }), true);
    assertStrictEquals(keepsDesign({}, {}), false);
  });
});
