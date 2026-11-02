import { assert, assertFalse } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { exceedsTolerance } from "./metrics.ts";

describe("exceedsTolerance", () => {
  it("allows a money floor of 20 or 2% of the platform value", () => {
    // Below 1,000 the floor of 20 wins; exactly at the threshold is not a mismatch.
    assertFalse(exceedsTolerance(1020, 1000, "money"));
    assert(exceedsTolerance(1020.01, 1000, "money"));
    assertFalse(exceedsTolerance(5, 0, "money"));
    assertFalse(exceedsTolerance(0, 20, "money"));
    assert(exceedsTolerance(0, 20.01, "money"));
    // Above 1,000 the 2% wins: 2% of 5,000 is 100.
    assertFalse(exceedsTolerance(4900, 5000, "money"));
    assert(exceedsTolerance(4899.99, 5000, "money"));
  });

  it("allows result counts one off, then 2%", () => {
    assertFalse(exceedsTolerance(9, 10, "count"));
    assert(exceedsTolerance(8, 10, "count"));
    assertFalse(exceedsTolerance(98, 100, "count"));
    assert(exceedsTolerance(97, 100, "count"));
    // Floating noise does not create a mismatch at the boundary.
    assertFalse(exceedsTolerance(0.1 + 0.2 + 19.7, 0, "money"));
  });
});
