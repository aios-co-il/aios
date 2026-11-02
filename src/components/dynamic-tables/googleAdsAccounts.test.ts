import { describe, expect, it } from "vitest";
import { type GoogleAdsAccount, managerIdSetting } from "./googleAdsAccounts";

const account = (overrides: Partial<GoogleAdsAccount>): GoogleAdsAccount => ({
  id: "1234567890",
  name: "Shop",
  currency: "ILS",
  manager: false,
  ...overrides,
});

describe("managerIdSetting", () => {
  it("carries the MCC the account is reached through", () => {
    expect(managerIdSetting(account({ manager_id: "4568787244" }))).toEqual({
      manager_id: "4568787244",
    });
  });

  it("clears the previous MCC for an account reached directly", () => {
    expect(managerIdSetting(account({}))).toEqual({ manager_id: null });
  });

  it("leaves the setting alone for an id typed by hand", () => {
    expect(managerIdSetting(undefined)).toEqual({});
  });
});
