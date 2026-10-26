import { describe, expect, it } from "vitest";
import {
  invalidEnumMessage,
  isClientMoodStatus,
  isClientStatus,
  isLeadSource,
} from "./crmEnums-b13";

describe("CRM enum guards", () => {
  it("accepts database enum values", () => {
    expect(isClientMoodStatus("churn_risk")).toBe(true);
    expect(isClientStatus("onboarding")).toBe(true);
    expect(isLeadSource("paid_ads")).toBe(true);
  });

  it("rejects other values", () => {
    expect(isClientMoodStatus("normal")).toBe(false);
    expect(isClientMoodStatus(null)).toBe(false);
    expect(isClientStatus("archived")).toBe(false);
    expect(isLeadSource("facebook")).toBe(false);
  });

  it("formats out-of-enum values like zod", () => {
    expect(invalidEnumMessage(["A", "B", "C"], "D")).toBe(
      "Invalid enum value. Expected 'A' | 'B' | 'C', received 'D'",
    );
  });
});
