import assert from "node:assert/strict";
import test from "node:test";
import { reportHasSyncedWebsiteLeads } from "./websiteLeadsColumn.ts";

test("all-zero website leads are not a synced column", () => {
  assert.equal(
    reportHasSyncedWebsiteLeads([
      { data: { verified_leads: 0 } },
      { data: { verified_leads: 0 } },
    ]),
    false,
  );
});

test("a positive website lead keeps the column", () => {
  assert.equal(
    reportHasSyncedWebsiteLeads([
      { data: { verified_leads: 0 } },
      { data: { verified_leads: 2 } },
    ]),
    true,
  );
});

test("missing website lead fields stay hidden", () => {
  assert.equal(reportHasSyncedWebsiteLeads([{ data: {} }, null]), false);
});
