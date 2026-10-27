import { describe, expect, it } from "vitest";
import {
  reportSenderLabel,
  reportSenderOptionLabel,
} from "./reportSenderLabel";

const base = {
  integration_type: "green_api",
  display_name: null,
  last4: null,
  owner_name: null,
  owner_tenant_name: null,
  is_shared: false,
  carmen_role: null,
};

describe("reportSenderLabel", () => {
  it("names Carmen's main Manus line", () => {
    expect(reportSenderLabel({ ...base, integration_type: "manus_wa" })).toBe(
      "הטלפון של כרמן",
    );
    expect(
      reportSenderLabel({
        ...base,
        integration_type: "manus_wa",
        carmen_role: "primary",
        display_name: "DMM",
      }),
    ).toBe("הטלפון של כרמן");
  });

  it("names other lines by name, owner or last digits", () => {
    expect(
      reportSenderLabel({
        ...base,
        integration_type: "manus_wa",
        carmen_role: "secondary",
        display_name: "משרד",
      }),
    ).toBe("משרד");
    expect(reportSenderLabel({ ...base, owner_name: "דוד" })).toBe(
      "הטלפון של דוד",
    );
    expect(reportSenderLabel({ ...base, last4: "1234" })).toBe(
      "וואטסאפ ··1234",
    );
    expect(reportSenderLabel(base)).toBe("וואטסאפ");
  });

  it("marks a line another organization shared", () => {
    expect(
      reportSenderLabel({
        ...base,
        integration_type: "manus_wa",
        is_shared: true,
        owner_tenant_name: "AIOS",
      }),
    ).toBe("הטלפון של כרמן (משותף מ-AIOS)");
    expect(reportSenderLabel({ ...base, last4: "9", is_shared: true })).toBe(
      "וואטסאפ ··9 (משותף)",
    );
  });

  it("marks a line that cannot send yet in lists", () => {
    expect(
      reportSenderOptionLabel({ ...base, owner_name: "דוד", ready: false }),
    ).toBe("הטלפון של דוד (לא מחובר)");
    expect(
      reportSenderOptionLabel({ ...base, owner_name: "דוד", ready: true }),
    ).toBe("הטלפון של דוד");
  });
});
