import { describe, expect, it } from "vitest";
import { readOpenAiBillingStatus } from "./billingStatus";
describe("billing response boundary", () => {
  it("retains valid numeric costs and rejects object-valued metrics", () => {
    expect(
      readOpenAiBillingStatus({
        ok: true,
        admin_available: true,
        current_month_usage_cost: 4,
      }).current_month_usage_cost,
    ).toBe(4);
    expect(() =>
      readOpenAiBillingStatus({
        ok: true,
        admin_available: true,
        current_month_usage_cost: {},
      }),
    ).toThrow("Invalid billing response");
  });
});
