import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { readReportSettings } from "./report-settings.ts";
import { reportCampaignGoalOf } from "../_shared/campaign-goal/campaign-goals.ts";
import { clientAdAccountIds } from "../_shared/campaign-pulse.ts";

describe("report settings domain contract", () => {
  it("preserves goal classification and resolves all supported account aliases", () => {
    const table = {
      id: "table-1",
      integration_type: "facebook_insights",
      integration_settings: readReportSettings({
        campaign_type: "leads",
        ad_account_id: "act_123",
        account_id: "456",
        meta_account_id: "789",
        customer_id: "321",
      }),
    };
    assertEquals(clientAdAccountIds([table]), ["123", "456", "789", "321"]);
    const record = {
      table_id: table.id,
      data: { campaign_id: "campaign-1", campaign_type: "ecommerce" },
    };
    assertEquals(
      reportCampaignGoalOf([record], [table])(record)?.goal,
      "leads",
    );
  });

  it("retains the legacy numeric and singleton-array account ids accepted by existing tools", () => {
    assertEquals(readReportSettings({ ad_account_id: 123 }).ad_account_id, 123);
    assertEquals(
      readReportSettings({ ad_account_id: [123] }).ad_account_id,
      123,
    );
    assertEquals(
      readReportSettings({ account_id: ["act_456"] }).account_id,
      "act_456",
    );
    assertEquals(
      readReportSettings({ meta_account_id: null }).meta_account_id,
      null,
    );
    assertEquals(
      readReportSettings({ ad_account_id: "123", account_status: "1" })
        .account_status,
      "1",
    );
  });

  it("drops only each malformed optional field and retains account, goal and passthrough settings", () => {
    const settings = {
      ad_account_id: "act_123",
      campaign_type: "leads",
      custom: { retained: true },
    };
    for (const { input, expected } of [
      {
        input: { ad_account_name: {} },
        expected: { ad_account_name: undefined },
      },
      {
        input: { account_status: [] },
        expected: { account_status: undefined },
      },
      {
        input: { campaign_type: true },
        expected: { campaign_type: undefined },
      },
    ]) {
      const parsed = readReportSettings({ ...settings, ...input });
      assertEquals<unknown>(parsed, { ...settings, ...expected });
      assertEquals(clientAdAccountIds([{ integration_settings: parsed }]), [
        "123",
      ]);
    }
    assertEquals(
      readReportSettings({ ad_account_id: {} }).ad_account_id,
      undefined,
    );
    assertEquals(readReportSettings(null), {});
    assertEquals(readReportSettings([]), {});
  });
});
