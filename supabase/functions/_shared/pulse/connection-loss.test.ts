import { assertStrictEquals } from "jsr:@std/assert@1";
import { evaluatePulseInstantAlerts } from "../pulse-instant-alerts.ts";
import { isRealConnectionLoss } from "./connection-loss.ts";
import { healthy, NO_CONTACT_OFF } from "./fake-alert-log.ts";

type Issue = { clientId: string; alertType: string };

Deno.test("evaluatePulseInstantAlerts", async (t) => {
  await t.step(
    "connection_lost marks only real connection loss as Shabbat-critical",
    () => {
      const evaluate = (flags: string[], issues: Issue[] = []) =>
        evaluatePulseInstantAlerts([healthy(flags)], issues, NO_CONTACT_OFF)[0]
          ?.shabbat_critical;
      assertStrictEquals(evaluate(["סנכרון ישן: Meta"]), true);
      assertStrictEquals(evaluate(["אין טבלת קמפיין מחוברת"]), true);
      assertStrictEquals(
        evaluate([], [{ clientId: "c1", alertType: "account_disabled" }]),
        true,
      );
      assertStrictEquals(evaluate(["קמפיין נעצר"]), false);
      assertStrictEquals(
        evaluate([], [{ clientId: "c1", alertType: "ad_disapproved" }]),
        false,
      );
      assertStrictEquals(
        evaluate([], [{ clientId: "c1", alertType: "campaign_stopped" }]),
        false,
      );
    },
  );
});

Deno.test("isRealConnectionLoss", async (t) => {
  await t.step(
    "a lost data source or an account-level stop is real; one campaign's issue is not",
    () => {
      assertStrictEquals(isRealConnectionLoss(["סנכרון ישן"], false, []), true);
      assertStrictEquals(isRealConnectionLoss(["אין טבלת"], true, []), true);
      assertStrictEquals(isRealConnectionLoss(["אין טבלת"], false, []), false);
      assertStrictEquals(
        isRealConnectionLoss([], false, [{ alertType: "account_disabled" }]),
        true,
      );
      assertStrictEquals(
        isRealConnectionLoss(["2 קמפיינים נעצרו"], true, [
          { alertType: "campaign_stopped" },
          { alertType: null },
        ]),
        false,
      );
    },
  );
});
