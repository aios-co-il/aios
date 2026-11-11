import { describe, expect, it } from "vitest";
import {
  CLEARED_CLIENT_FILTERS,
  DEFAULT_CLIENT_FILTERS,
  activeClientFilterCount,
  applyClientFilters,
  type FilterableClient,
} from "./clientFilters";

const clients: Array<FilterableClient & { id: string }> = [
  {
    id: "a",
    name: "Alpha",
    status: "active",
    mood_status: "happy",
    services: ["ppc_meta"],
    client_team: [{ campaigner_id: "c1" }],
  },
  {
    id: "b",
    name: "Beta",
    status: "paused",
    mood_status: "churn_risk",
    services: [],
    is_seo_client: true,
  },
  { id: "c", name: "Gamma", status: "onboarding", services: ["seo"] },
];

/** The ids of the rows the filters keep. */
function idsFor(filters: typeof DEFAULT_CLIENT_FILTERS) {
  return applyClientFilters(clients, filters).map((c) => c.id);
}

describe("applyClientFilters", () => {
  it("hides inactive clients by default", () => {
    expect(idsFor(DEFAULT_CLIENT_FILTERS)).toEqual(["a", "c"]);
  });

  it("lets an explicit status override hiding inactive clients", () => {
    expect(idsFor({ ...DEFAULT_CLIENT_FILTERS, status: "paused" })).toEqual([
      "b",
    ]);
  });

  it("matches SEO by flag or tag", () => {
    expect(idsFor({ ...CLEARED_CLIENT_FILTERS, service: "seo" })).toEqual([
      "b",
      "c",
    ]);
  });

  it("filters by campaigner, mood and a case-blind name search", () => {
    expect(idsFor({ ...CLEARED_CLIENT_FILTERS, campaigner: "c1" })).toEqual([
      "a",
    ]);
    expect(idsFor({ ...CLEARED_CLIENT_FILTERS, mood: "churn_risk" })).toEqual([
      "b",
    ]);
    expect(idsFor({ ...CLEARED_CLIENT_FILTERS, search: "gam" })).toEqual(["c"]);
  });
});

describe("activeClientFilterCount", () => {
  it("counts hide-inactive and each set filter, not the search", () => {
    expect(activeClientFilterCount(DEFAULT_CLIENT_FILTERS)).toBe(1);
    expect(
      activeClientFilterCount({
        ...CLEARED_CLIENT_FILTERS,
        status: "ended",
        search: "x",
      }),
    ).toBe(1);
  });
});
