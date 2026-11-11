import { describe, expect, it } from "vitest";
import {
  readFacebookAdAccounts,
  readGoogleAdsAccounts,
} from "./adAccountLists";
describe("ad account lists", () => {
  it("reads Facebook and Google Ads account arrays", () => {
    expect(
      readFacebookAdAccounts({
        ad_accounts: [
          { id: "act_1", name: "Main", currency: "ILS" },
          { id: 2 },
        ],
      }),
    ).toEqual([{ id: "act_1", name: "Main", currency: "ILS" }]);
    expect(
      readGoogleAdsAccounts({ accounts: [{ id: 123, name: "G" }, {}] }),
    ).toEqual([{ id: "123", name: "G", currency: "", manager: false }]);
    expect(readFacebookAdAccounts(null)).toEqual([]);
  });
});
