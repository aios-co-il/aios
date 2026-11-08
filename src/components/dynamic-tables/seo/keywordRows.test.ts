import { describe, expect, it } from "vitest";
import {
  compareByPosition,
  dedupeKeywordRows,
  positionDelta,
} from "./keywordRows";
describe("keyword rows with numeric strings", () => {
  it("computes position deltas like JS subtraction did", () => {
    expect(positionDelta("12", "4")).toBe(8);
    expect(positionDelta(3, "5")).toBe(-2);
    expect(positionDelta(null, 4)).toBeNull();
  });

  it("sorts by numeric position, missing positions last", () => {
    const rows = [{ position: "10" }, { position: 2 }, {}, { position: "3" }];
    expect([...rows].sort(compareByPosition)).toEqual([
      { position: 2 },
      { position: "3" },
      { position: "10" },
      {},
    ]);
  });

  it("keeps the best-ranked variant and fills its blanks", () => {
    expect(
      dedupeKeywordRows([
        { keyword: "Shoes", position: "9", volume: 100, url: "/a" },
        { keyword: "shoes ", position: "2", traffic: "5", url: "" },
        { keyword: "", position: 1 },
      ]),
    ).toEqual([
      {
        keyword: "shoes ",
        position: "2",
        traffic: "5",
        volume: 100,
        url: "/a",
      },
    ]);
  });
});
