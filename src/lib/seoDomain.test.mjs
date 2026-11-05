import { expect, test } from "vitest";
import {
  buildSeoReportTenantIds,
  extractDomainHint,
  looksLikeSeoDomain,
  pickSeoSyncDomain,
  resolveLinkedCrmTableId,
  resolveSeoLinkedGscSiteUrl,
  selectSeoTableForClient,
  seoTableNeedsSyncThisMonth,
} from "./seoDomain.ts";

test("buildSeoReportTenantIds includes client home + agency access + table tenant", () => {
  const ids = buildSeoReportTenantIds(
    { tenant_id: "home", agency_id: "a1" },
    [{ accessing_tenant_id: "mc", source_tenant_id: "dmm" }],
    ["table-tenant"],
  );
  expect(ids.sort()).toStrictEqual(
    ["dmm", "home", "mc", "table-tenant"].sort(),
  );
});

test("extractDomainHint finds hostnames in table titles", () => {
  expect(extractDomainHint("ג.ג - אנגלית - gg-ds.com")).toBe("gg-ds.com");
  expect(extractDomainHint("YTS")).toBe("");
});

test("looksLikeSeoDomain rejects Hebrew client names stored as targetDomain", () => {
  expect(looksLikeSeoDomain("ג.ג - אנגלית - gg-ds.com")).toBe(false);
  expect(looksLikeSeoDomain("gg-ds.com")).toBe(true);
});

test("pickSeoSyncDomain prefers linkedGscSiteUrl and ahrefs_reports over empty client", () => {
  const fromGsc = pickSeoSyncDomain({
    settings: { linkedGscSiteUrl: "https://www.manltd.co.il/" },
    client: { website: null, ahrefs_domain: null },
    tableName: "מן מכונות ניקוי",
  });
  expect(fromGsc.domain).toBe("manltd.co.il");
  expect(fromGsc.from).toBe("linkedGscSiteUrl");

  const fromReport = pickSeoSyncDomain({
    settings: {},
    client: { website: null, ahrefs_domain: null },
    latestReportDomain: "manltd.co.il",
  });
  expect(fromReport.domain).toBe("manltd.co.il");
  expect(fromReport.from).toBe("ahrefs_reports");
});

test("resolveLinkedCrmTableId ignores stale saved ids", () => {
  const candidates = [{ id: "ga-live", client_id: "client-1" }];
  expect(resolveLinkedCrmTableId("ga-deleted", candidates, "client-1")).toBe(
    "ga-live",
  );
  expect(resolveLinkedCrmTableId("ga-live", candidates, "client-1")).toBe(
    "ga-live",
  );
});

test("resolveLinkedCrmTableId prefers this client's table over another client's saved link", () => {
  const candidates = [
    { id: "ga-other", client_id: "other-client" },
    { id: "ga-own", client_id: "client-1" },
  ];
  expect(resolveLinkedCrmTableId("ga-other", candidates, "client-1")).toBe(
    "ga-own",
  );
  expect(
    resolveLinkedCrmTableId(
      "ga-other",
      [{ id: "ga-other", client_id: "other-client" }],
      "client-1",
    ),
  ).toBe("ga-other");
});

test("selectSeoTableForClient prefers domain match over null-domain duplicate", () => {
  const picked = selectSeoTableForClient(
    [
      {
        id: "dup",
        client_id: "client-1",
        integration_settings: { targetDomain: null },
        updated_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "good",
        client_id: "client-1",
        integration_settings: { targetDomain: "franchise.org.il" },
        updated_at: "2026-08-01T00:00:00Z",
      },
    ],
    "client-1",
    "https://franchise.org.il",
  );
  expect(picked?.id).toBe("good");
});

test("resolveSeoLinkedGscSiteUrl prefers linkedGscSiteUrl and falls back to legacy gsc_site_url", () => {
  expect(
    resolveSeoLinkedGscSiteUrl({
      integrationSettings: {
        linkedGscSiteUrl: "sc-domain:franchise.org.il",
        gsc_site_url: "https://other.example/",
      },
      expectedDomain: "franchise.org.il",
    }),
  ).toBe("sc-domain:franchise.org.il");

  expect(
    resolveSeoLinkedGscSiteUrl({
      integrationSettings: { gsc_site_url: "sc-domain:franchise.org.il" },
      clientGscSiteUrl: "https://franchise.org.il/",
      expectedDomain: "franchise.org.il",
    }),
  ).toBe("sc-domain:franchise.org.il");

  expect(
    resolveSeoLinkedGscSiteUrl({
      integrationSettings: {},
      clientGscSiteUrl: "https://franchise.org.il/",
      expectedDomain: "franchise.org.il",
    }),
  ).toBe("https://franchise.org.il/");

  expect(
    resolveSeoLinkedGscSiteUrl({
      integrationSettings: { gsc_site_url: "https://other.example/" },
      expectedDomain: "franchise.org.il",
    }),
  ).toBe("");
});

test("seoTableNeedsSyncThisMonth is true when last sync is before current month", () => {
  const lastMonth = new Date();
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  expect(seoTableNeedsSyncThisMonth(lastMonth.toISOString())).toBe(true);
  expect(seoTableNeedsSyncThisMonth(null)).toBe(true);
  expect(seoTableNeedsSyncThisMonth(new Date().toISOString())).toBe(false);
});
