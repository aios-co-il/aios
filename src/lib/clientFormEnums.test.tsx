import { describe, expect, it } from "vitest";
import {
  toFormStatus,
  toFormTier,
  unrepresentableClientFields,
} from "./clientFormEnums";

describe("toFormStatus / toFormTier", () => {
  it("maps values the form offers and leaves the rest undefined", () => {
    expect(toFormStatus("paused")).toBe("paused");
    expect(toFormStatus("inactive")).toBeUndefined();
    expect(toFormTier("B")).toBe("B");
    expect(toFormTier("VIP")).toBeUndefined();
    expect(toFormTier(null)).toBeNull();
  });
});

describe("unrepresentableClientFields", () => {
  it("allows a valid stored tier and status", () => {
    expect(
      unrepresentableClientFields(
        { status: "active", tier: "A" },
        { status: "active", tier: "A" },
      ),
    ).toEqual([]);
  });

  it("treats a missing status as active and a missing tier as valid", () => {
    expect(unrepresentableClientFields({}, {})).toEqual([]);
  });

  it("flags an inactive stored status the user did not replace", () => {
    expect(unrepresentableClientFields({ status: "inactive" }, {})).toEqual([
      {
        field: "status",
        message:
          "Invalid enum value. Expected 'active' | 'paused' | 'ended' | 'onboarding', received 'inactive'",
      },
    ]);
  });

  it("flags an unknown stored tier the user did not replace", () => {
    expect(
      unrepresentableClientFields(
        { status: "active", tier: "VIP" },
        {
          status: "active",
        },
      ),
    ).toEqual([
      {
        field: "tier",
        message: "Invalid enum value. Expected 'A' | 'B' | 'C', received 'VIP'",
      },
    ]);
  });

  it("stops flagging once the user picks a value the form supports", () => {
    expect(
      unrepresentableClientFields(
        { status: "inactive", tier: "VIP" },
        { status: "paused", tier: "C" },
      ),
    ).toEqual([]);
  });
});
