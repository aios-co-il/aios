import { assertEquals } from "jsr:@std/assert@1";
import { isCampaignRole } from "./campaign-role.ts";

Deno.test("isCampaignRole", async (t) => {
  await t.step("matches campaign and PPC roles in English and Hebrew", () => {
    for (const role of [
      "Campaign manager",
      "PPC",
      "קמפיינר",
      "מנהל קמפיינים",
    ]) {
      assertEquals(isCampaignRole(role), true, role);
    }
  });

  await t.step("rejects other roles and a missing role", () => {
    for (const role of ["account manager", "SEO", "", null, undefined]) {
      assertEquals(isCampaignRole(role), false, String(role));
    }
  });
});
