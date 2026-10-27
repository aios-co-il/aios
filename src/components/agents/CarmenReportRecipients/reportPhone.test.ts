import { describe, expect, it } from "vitest";
import { toReportPhoneE164 } from "./reportPhone";

describe("toReportPhoneE164", () => {
  it("turns a local Israeli mobile into E.164", () => {
    expect(toReportPhoneE164("050-123-4567")).toBe("+972501234567");
  });

  it("keeps an international number", () => {
    expect(toReportPhoneE164("+1 (415) 555-0100")).toBe("+14155550100");
  });

  it("refuses input that cannot be a phone", () => {
    expect(toReportPhoneE164("")).toBeNull();
    expect(toReportPhoneE164("12345")).toBeNull();
    expect(toReportPhoneE164("phone")).toBeNull();
  });
});
