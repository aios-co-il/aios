import { expect, test } from "vitest";

import {
  isLastVisibleSharedReportTab,
  isSharedReportTabVisible,
  parseSharedReportTabs,
  withSharedReportTab,
} from "./sharedReportTabs.ts";

test("share links with no saved preference show every tab", () => {
  expect(parseSharedReportTabs(null)).toStrictEqual({
    seo: true,
    gsc: true,
    ga: true,
    maskyoo: true,
    monthly_work: true,
  });
  expect(parseSharedReportTabs({ targetDomain: "example.com" })).toStrictEqual({
    seo: true,
    gsc: true,
    ga: true,
    maskyoo: true,
    monthly_work: true,
  });
});

test("a hidden tab stays hidden and the rest stay visible", () => {
  const visibility = parseSharedReportTabs({ shared_tabs: { maskyoo: false } });
  expect(visibility.maskyoo).toBe(false);
  expect(visibility.seo).toBe(true);
  expect(visibility.monthly_work).toBe(true);
  expect(
    isSharedReportTabVisible({ shared_tabs: { maskyoo: false } }, "maskyoo"),
  ).toBe(false);
});

test("legacy and string-ish values are understood", () => {
  const visibility = parseSharedReportTabs({
    sharedTabs: { "monthly-work": false, searchconsole: "false", ga: 1 },
  });
  expect(visibility.monthly_work).toBe(false);
  expect(visibility.gsc).toBe(false);
  expect(visibility.ga).toBe(true);
});

test("hiding every tab still leaves the SEO tab", () => {
  const visibility = parseSharedReportTabs({
    shared_tabs: {
      seo: false,
      gsc: false,
      ga: false,
      maskyoo: false,
      monthly_work: false,
    },
  });
  expect(visibility.seo).toBe(true);
});

test("malformed stored values are ignored", () => {
  expect(parseSharedReportTabs({ shared_tabs: ["maskyoo"] }).maskyoo).toBe(
    true,
  );
  expect(parseSharedReportTabs({ shared_tabs: "maskyoo" }).maskyoo).toBe(true);
  expect(
    parseSharedReportTabs({ shared_tabs: { unknown_tab: false } }).seo,
  ).toBe(true);
});

test("toggling one tab keeps the other integration settings", () => {
  const next = withSharedReportTab(
    { targetDomain: "example.com", shared_tabs: { ga: false } },
    "maskyoo",
    false,
  );
  expect(next.targetDomain).toBe("example.com");
  expect(next.shared_tabs).toStrictEqual({
    seo: true,
    gsc: true,
    ga: false,
    maskyoo: false,
    monthly_work: true,
  });
});

test("the last visible tab is flagged so the UI can block hiding it", () => {
  const onlySeo = parseSharedReportTabs({
    shared_tabs: { gsc: false, ga: false, maskyoo: false, monthly_work: false },
  });
  expect(isLastVisibleSharedReportTab(onlySeo, "seo")).toBe(true);
  expect(isLastVisibleSharedReportTab(onlySeo, "maskyoo")).toBe(false);
  expect(isLastVisibleSharedReportTab(parseSharedReportTabs(null), "seo")).toBe(
    false,
  );
});
