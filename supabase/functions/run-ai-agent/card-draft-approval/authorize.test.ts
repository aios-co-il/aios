import { assertEquals } from "jsr:@std/assert@1";
import { type ApproveCaller, approveRight } from "./authorize.ts";

const finding = { owner_user_id: "dana", agency_id: "a1" };
const caller = (fields: Partial<ApproveCaller>): ApproveCaller => ({
  userId: "x",
  campaignerId: null,
  isManagerRole: false,
  isTeamManager: false,
  managedAgencyIds: [],
  ...fields,
});

Deno.test("approveRight", async (t) => {
  await t.step(
    "the finding's person, an owner-level manager and the agency's team manager may",
    () => {
      assertEquals(approveRight(finding, caller({ userId: "dana" })), "yes");
      assertEquals(
        approveRight(finding, caller({ isManagerRole: true })),
        "yes",
      );
      assertEquals(
        approveRight(
          finding,
          caller({ isTeamManager: true, managedAgencyIds: ["a1"] }),
        ),
        "yes",
      );
    },
  );

  await t.step("a campaigner only when assigned to the client", () => {
    assertEquals(
      approveRight(finding, caller({ campaignerId: "camp2" })),
      "if_assigned",
    );
  });

  await t.step(
    "a team manager of another agency, or anyone else, may not",
    () => {
      assertEquals(
        approveRight(
          finding,
          caller({ isTeamManager: true, managedAgencyIds: ["a2"] }),
        ),
        "no",
      );
      assertEquals(approveRight(finding, caller({})), "no");
    },
  );
});
