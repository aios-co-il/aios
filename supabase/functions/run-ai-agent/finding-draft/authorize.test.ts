import { assertEquals } from "jsr:@std/assert@1";
import { type ConfirmCaller, confirmRight } from "./authorize.ts";

const campaigner: ConfirmCaller = {
  userId: "noa",
  campaignerId: "k-noa",
  isManagerRole: false,
  isTeamManager: false,
  managedAgencyIds: [],
};
const attributed = {
  owner_user_id: "dana",
  agency_id: "a1",
  evidence: { attributed: true },
};

Deno.test("confirmRight", async (t) => {
  await t.step("the finding's own person may", () => {
    assertEquals(
      confirmRight(attributed, { ...campaigner, userId: "dana" }),
      "yes",
    );
  });

  await t.step(
    "an owner-level manager or the agency's team manager may",
    () => {
      assertEquals(
        confirmRight(attributed, { ...campaigner, isManagerRole: true }),
        "yes",
      );
      const teamManager = { ...campaigner, isTeamManager: true };
      assertEquals(
        confirmRight(attributed, { ...teamManager, managedAgencyIds: ["a1"] }),
        "yes",
      );
      assertEquals(
        confirmRight(attributed, { ...teamManager, managedAgencyIds: ["a2"] }),
        "no",
      );
    },
  );

  await t.step(
    "another campaigner only for a call nobody was named for",
    () => {
      assertEquals(confirmRight(attributed, campaigner), "no");
      const office = { ...attributed, evidence: { attributed: false } };
      assertEquals(confirmRight(office, campaigner), "if_assigned");
      assertEquals(
        confirmRight(office, { ...campaigner, campaignerId: null }),
        "no",
      );
    },
  );
});
