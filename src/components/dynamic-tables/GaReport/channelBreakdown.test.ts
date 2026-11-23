import { describe, expect, it } from "vitest";
import {
  breakdownFromChannels,
  breakdownFromSources,
  channelKind,
} from "./channelBreakdown";

const channel = (channel_group: string, users: number, key_events = 0) => ({
  data: {
    report_type: "channel_group",
    channel_group,
    users,
    sessions: users,
    key_events,
  },
});

describe("channelKind", () => {
  it("counts Google's Cross-network and Display as paid", () => {
    expect(channelKind("Cross-network")).toBe("paid");
    expect(channelKind("Display")).toBe("paid");
    expect(channelKind("Paid Other")).toBe("paid");
    expect(channelKind("Paid Social")).toBe("paid");
  });

  it("counts every organic channel as organic and the rest as other", () => {
    expect(channelKind("Organic Search")).toBe("organic");
    expect(channelKind("Organic Social")).toBe("organic");
    expect(channelKind("Direct")).toBe("other");
    expect(channelKind("Unassigned")).toBe("other");
    expect(channelKind("Referral")).toBe("other");
  });
});

describe("breakdownFromChannels", () => {
  it("splits every user into organic, paid or other (Eco, 30 days)", () => {
    const records = [
      channel("Cross-network", 27000, 300),
      channel("Direct", 7012, 40),
      channel("Organic Search", 6854, 90),
      channel("Paid Social", 5226, 120),
      channel("Organic Social", 1979),
      channel("Paid Other", 1586),
      channel("Unassigned", 1037),
      channel("Referral", 506),
    ];
    const breakdown = breakdownFromChannels(records);

    expect(breakdown.paid.users).toBe(27000 + 5226 + 1586);
    expect(breakdown.organic.users).toBe(6854 + 1979);
    expect(breakdown.other.users).toBe(7012 + 1037 + 506);
    expect(breakdown.paid.conversions).toBe(420);
    expect(
      breakdown.organic.users + breakdown.paid.users + breakdown.other.users,
    ).toBe(records.reduce((sum, r) => sum + r.data.users, 0));
  });
});

describe("breakdownFromSources", () => {
  it("classifies source/medium names when no channel rows are stored", () => {
    const breakdown = breakdownFromSources([
      { name: "google / cpc", sessions: 10, users: 8, conversions: 2 },
      { name: "google / organic", sessions: 6, users: 5, conversions: 1 },
      { name: "(direct) / (none)", sessions: 4, users: 3, conversions: 0 },
    ]);
    expect(breakdown.paid.users).toBe(8);
    expect(breakdown.organic.users).toBe(5);
    expect(breakdown.other.users).toBe(3);
  });
});
