import { assert, assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { CallBudget } from "../_shared/reconcile/budget.ts";
import { TOKEN } from "../_shared/reconcile/meta-recordings.ts";
import { replay, sleepRecorder } from "../_shared/reconcile/test-fixtures.ts";
import { listMetaAccountsWithSpend } from "./meta-accounts.ts";

describe("listMetaAccountsWithSpend", () => {
  it("pages through accounts with 7-day spend", async () => {
    const rec = replay([
      {
        match: /\/me\/adaccounts\?(?!after)/,
        body: {
          data: [
            {
              account_id: "1",
              name: "A",
              currency: "ILS",
              insights: { data: [{ spend: "500.5" }] },
            },
            { account_id: "2", name: "B", currency: "ILS" },
          ],
          paging: {
            next: `https://graph.facebook.com/v21.0/me/adaccounts?after=x&access_token=${TOKEN}`,
          },
        },
      },
      {
        match: /\/me\/adaccounts\?after=x/,
        body: {
          data: [
            {
              id: "act_3",
              name: "C",
              currency: "USD",
              insights: { data: [{ spend: "40" }] },
            },
          ],
        },
      },
    ]);
    const accounts = await listMetaAccountsWithSpend({
      token: TOKEN,
      budget: new CallBudget(5),
      fetch: rec.fetchFn,
      sleep: sleepRecorder().sleep,
    });
    assertEquals(accounts, [
      { account_id: "act_1", name: "A", currency: "ILS", spend_7d: 500.5 },
      { account_id: "act_2", name: "B", currency: "ILS", spend_7d: 0 },
      { account_id: "act_3", name: "C", currency: "USD", spend_7d: 40 },
    ]);
    const fields = new URL(rec.calls[0].url).searchParams.get("fields");
    assert(fields?.includes("insights.date_preset(last_7d){spend}"));
  });
});
