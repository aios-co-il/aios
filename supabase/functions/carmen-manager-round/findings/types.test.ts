import { assertEquals } from "jsr:@std/assert@1";
import {
  MANAGER_ROUND_MIGRATION,
  quotedList,
} from "../../_shared/manager-round/migration-lists.ts";
import {
  DELIVERED_STATUSES,
  DELIVERY_STATUSES,
  evidenceText,
  type Recipient,
  uniqueByKey,
  wentOut,
} from "./types.ts";

Deno.test("findings types", async (t) => {
  const sql = await Deno.readTextFile(MANAGER_ROUND_MIGRATION);

  await t.step("DELIVERY_STATUSES matches the deliveries status CHECK", () => {
    assertEquals(
      quotedList(
        sql,
        "CREATE TABLE IF NOT EXISTS public.carmen_finding_deliveries",
        "CHECK (status IN (",
      ),
      [...DELIVERY_STATUSES],
    );
  });

  await t.step("DELIVERED_STATUSES matches carmen_delivery_went_out", () => {
    assertEquals(
      quotedList(
        sql,
        "FUNCTION public.carmen_delivery_went_out",
        "p_status IN (",
      ),
      [...DELIVERED_STATUSES],
    );
    assertEquals(
      ["sent", "delivery_unknown", "failed", "preview"].map(wentOut),
      [true, true, false, false],
    );
  });

  await t.step("evidenceText reads only string fields of an object", () => {
    assertEquals(evidenceText({ alert_type: "x", n: 1 }, "alert_type"), "x");
    assertEquals(evidenceText({ alert_type: "x", n: 1 }, "n"), null);
    assertEquals(evidenceText(["alert_type"], "alert_type"), null);
    assertEquals(evidenceText(null, "alert_type"), null);
  });

  await t.step("uniqueByKey keeps the first recipient of each key", () => {
    const person = (key: string, name: string): Recipient => ({
      key,
      user_id: null,
      name,
      phone: null,
      role: "campaigner",
    });
    assertEquals(
      uniqueByKey([person("a", "1"), person("b", "2"), person("a", "3")]).map(
        (recipient) => recipient.name,
      ),
      ["1", "2"],
    );
  });
});
