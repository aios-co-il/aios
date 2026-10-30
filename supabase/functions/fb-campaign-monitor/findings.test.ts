import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { findingMessage } from "../_shared/campaign-status-alerts/finding-message.ts";
import type { ReportAccount } from "../_shared/campaign-status-alerts/types.ts";
import { findingsFor } from "./findings.ts";
import type { AccountSnapshot, MetaAd } from "./types.ts";

const REPORT: ReportAccount = {
  platform: "meta",
  adAccountId: "act_1",
  clientId: "client-1",
  clientName: "פיצה רומא",
  integrationId: null,
};

const live = (id: string, effective_status = "ACTIVE") => ({
  id,
  name: `קמפיין ${id}`,
  effective_status,
  issues_count: 0,
});

const snapshot = (over: Partial<AccountSnapshot> = {}): AccountSnapshot => ({
  accountName: "Roma Ads",
  accountStatus: 1,
  campaigns: [],
  blockedAds: [],
  hasLiveAd: true,
  ...over,
});

const ad = (
  effective_status: string,
  campaignStatus: string,
  campaignId = "c1",
): MetaAd => ({
  id: `ad-${campaignId}-${effective_status}`,
  name: "מודעה",
  effective_status,
  campaign: {
    id: campaignId,
    name: "קמפיין c1",
    effective_status: campaignStatus,
  },
});

const types = (s: AccountSnapshot) =>
  findingsFor(REPORT, s).map((f) => f.alert_type);

Deno.test("one live campaign beside a paused one is fine", () => {
  // Paused campaigns are not even read (the campaigns call asks for ACTIVE and
  // WITH_ISSUES only); one live ad is enough.
  assertEquals(types(snapshot({ campaigns: [live("c1")] })), []);
});

Deno.test(
  "nothing live on an active report alerts once, on the account",
  () => {
    const findings = findingsFor(REPORT, snapshot({ hasLiveAd: false }));
    assertEquals(
      findings.map((f) => [f.alert_type, f.campaign_id]),
      [["no_live_ads", "account:act_1"]],
    );
    const message = findingMessage(REPORT, findings[0]);
    assertMatch(message, /פיצה רומא/);
    assertMatch(message, /אין אף מודעה באוויר/);
    assertMatch(message, /לסמן את הדוח שלו כלא פעיל/);
  },
);

Deno.test("a campaign Meta stopped alerts even when another is live", () => {
  const findings = findingsFor(
    REPORT,
    snapshot({ campaigns: [live("c1"), live("c2", "WITH_ISSUES")] }),
  );
  assertEquals(
    findings.map((f) => [f.alert_type, f.campaign_id, f.severity]),
    [["campaign_stopped", "c2", "critical"]],
  );
  assertMatch(findingMessage(REPORT, findings[0]), /קמפיין: קמפיין c2/);
});

Deno.test("a restricted account reports only the account", () => {
  const findings = findingsFor(
    REPORT,
    snapshot({
      accountStatus: 3,
      hasLiveAd: false,
      campaigns: [live("c2", "WITH_ISSUES")],
    }),
  );
  assertEquals(
    findings.map((f) => [f.alert_type, f.campaign_id]),
    [["account_disabled", "account:act_1"]],
  );
  assertMatch(findingMessage(REPORT, findings[0]), /התשלום לא הוסדר/);
  assertStrictEquals(
    findingMessage(REPORT, findings[0]).includes("קמפיין:"),
    false,
  );
});

Deno.test("an unpaid ad is a billing alert on the account", () => {
  assertEquals(
    types(snapshot({ blockedAds: [ad("PENDING_BILLING_INFO", "ACTIVE")] })),
    ["ad_account_billing_issue"],
  );
});

Deno.test(
  "a disapproved ad alerts only in a live campaign, once per campaign",
  () => {
    assertEquals(
      types(snapshot({ blockedAds: [ad("DISAPPROVED", "PAUSED")] })),
      [],
    );
    const findings = findingsFor(
      REPORT,
      snapshot({
        blockedAds: [
          ad("DISAPPROVED", "ACTIVE", "c1"),
          { ...ad("DISAPPROVED", "ACTIVE", "c1"), id: "ad-2" },
        ],
      }),
    );
    assertEquals(
      findings.map((f) => [f.alert_type, f.campaign_id, f.details.ads]),
      [["ad_disapproved", "c1", 2]],
    );
  },
);

Deno.test("campaign issues without a stop are recorded as a warning", () => {
  const findings = findingsFor(
    REPORT,
    snapshot({ campaigns: [{ ...live("c1"), issues_count: 2 }] }),
  );
  assertEquals(
    findings.map((f) => [f.alert_type, f.severity]),
    [["campaign_with_issues", "warning"]],
  );
});
