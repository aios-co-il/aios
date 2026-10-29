import { describe, expect, it } from "vitest";
import {
  readAhrefsProjectList,
  readAhrefsSnapshotResponse,
} from "./ahrefsResponses";
import {
  readFacebookAdAccounts,
  readGoogleAdsAccounts,
} from "./adAccountLists";

describe("readAhrefsSnapshotResponse", () => {
  it("reads counts, error and the raw project id", () => {
    expect(
      readAhrefsSnapshotResponse({
        tracked_count: 2,
        keywords_count: "9",
        projectId: 77,
      }),
    ).toEqual({
      error: undefined,
      tracked_count: 2,
      keywords_count: undefined,
      projectId: 77,
    });
    expect(readAhrefsSnapshotResponse(null).error).toBeUndefined();
    expect(readAhrefsSnapshotResponse({ error: "quota" }).error).toBe("quota");
  });
});

describe("readAhrefsProjectList", () => {
  it("keeps numeric project ids as sent by Ahrefs", () => {
    const { projects } = readAhrefsProjectList({
      projects: [
        {
          project_id: 5,
          project_name: "Site",
          url: "https://a.com",
          domain: "a.com",
        },
        { project_name: "no id" },
      ],
    });
    expect(projects).toEqual([
      {
        project_id: 5,
        project_name: "Site",
        url: "https://a.com",
        domain: "a.com",
        keyword_count: undefined,
        mode: undefined,
        protocol: undefined,
      },
    ]);
    expect(readAhrefsProjectList({}).projects).toBeUndefined();
  });
});

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
    ).toEqual([{ id: 123, name: "G" }]);
    expect(readFacebookAdAccounts(null)).toEqual([]);
  });
});
