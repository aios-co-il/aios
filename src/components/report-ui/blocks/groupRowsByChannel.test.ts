import { describe, expect, it } from "vitest";
import { groupRowsByChannel } from "./groupRowsByChannel";

describe("groupRowsByChannel", () => {
  it("lists Meta campaigns first, then Google, each in its own order", () => {
    const rows = [
      { name: "g1", channel: "google_ads" as const },
      { name: "f1", channel: "facebook" as const },
      { name: "g2", channel: "google_ads" as const },
      { name: "f2", channel: "facebook" as const },
    ];
    expect(groupRowsByChannel(rows)).toEqual([
      { channel: "facebook", rows: [rows[1], rows[3]] },
      { channel: "google_ads", rows: [rows[0], rows[2]] },
    ]);
  });

  it("leaves out a platform with no campaigns", () => {
    const rows = [{ name: "g1", channel: "google_ads" as const }];
    expect(groupRowsByChannel(rows)).toEqual([{ channel: "google_ads", rows }]);
  });
});
