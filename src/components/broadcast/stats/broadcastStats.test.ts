import { describe, expect, it } from "vitest";
import { countRecipients, matchesFilter, percent } from "./broadcastStats";

const row = (over: Partial<Parameters<typeof matchesFilter>[0]> = {}) => ({
  status: "delivered",
  sent_at: "2026-10-29T10:00:00Z",
  delivered_at: "2026-10-29T10:00:05Z",
  opened_at: null,
  clicked_at: null,
  ...over,
});

describe("countRecipients", () => {
  it("counts each stage and bases rates on delivered mail", () => {
    const c = countRecipients([
      row({
        opened_at: "2026-10-29T11:00:00Z",
        clicked_at: "2026-10-29T11:01:00Z",
      }),
      row(),
      row({ status: "failed", sent_at: null, delivered_at: null }),
    ]);
    expect(c).toMatchObject({
      total: 3,
      sent: 2,
      delivered: 2,
      opened: 1,
      clicked: 1,
      failed: 1,
      rateBase: 2,
    });
  });

  it("falls back to sent mail before delivery events arrive", () => {
    expect(countRecipients([row({ delivered_at: null })]).rateBase).toBe(1);
  });
});

describe("percent", () => {
  it("rounds and shows a dash without a base", () => {
    expect(percent(1, 3)).toBe("33%");
    expect(percent(0, 0)).toBe("—");
  });
});

describe("matchesFilter", () => {
  it("keeps failed recipients out of 'not opened'", () => {
    expect(matchesFilter(row({ status: "failed" }), "not_opened")).toBe(false);
    expect(matchesFilter(row(), "not_opened")).toBe(true);
    expect(matchesFilter(row({ opened_at: "x" }), "opened")).toBe(true);
  });
});
