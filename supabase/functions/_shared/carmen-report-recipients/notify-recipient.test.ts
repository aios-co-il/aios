import { assertEquals } from "jsr:@std/assert@1";
import { notifyReportRecipient } from "./notify-recipient.ts";

const OWNER = {
  name: "Owner",
  phone: "972500000001",
  source: "owner_fallback" as const,
};

const FELIX = {
  name: "Felix",
  phone: "972500000011",
  source: "configured" as const,
};

Deno.test("notifyReportRecipient", async (t) => {
  await t.step("returns the first configured recipient", () => {
    assertEquals(
      notifyReportRecipient([FELIX, { ...FELIX, name: "Second" }]),
      FELIX,
    );
  });

  await t.step("never returns an owner of the fallback", () => {
    assertEquals(notifyReportRecipient([OWNER]), undefined);
  });

  await t.step("no list returns nothing", () => {
    assertEquals(notifyReportRecipient(undefined), undefined);
  });
});
