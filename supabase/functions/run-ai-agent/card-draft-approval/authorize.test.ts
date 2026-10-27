import { assertEquals } from "jsr:@std/assert@1";
import { type Approver, approveRight } from "./authorize.ts";

const finding = { owner_user_id: "dana", agency_id: "a1" };
const approver = (fields: Partial<Approver>): Approver => ({
  userId: "x",
  roles: ["campaigner"],
  managedAgencyIds: [],
  campaignerId: null,
  ...fields,
});

Deno.test("approveRight", async (t) => {
  await t.step(
    "the finding's person, an owner level and the agency's team manager may",
    () => {
      assertEquals(approveRight(finding, approver({ userId: "dana" })), "yes");
      for (const role of ["owner", "agency_owner"]) {
        assertEquals(
          approveRight(finding, approver({ roles: [role] })),
          "yes",
          role,
        );
      }
      assertEquals(
        approveRight(
          finding,
          approver({ roles: ["team_manager"], managedAgencyIds: ["a1"] }),
        ),
        "yes",
      );
    },
  );

  await t.step("a campaigner only when assigned to the client", () => {
    assertEquals(
      approveRight(finding, approver({ campaignerId: "camp2" })),
      "if_assigned",
    );
  });

  await t.step(
    "an agency manager role, another agency's team manager or anyone else may not",
    () => {
      assertEquals(
        approveRight(finding, approver({ roles: ["agency_manager"] })),
        "no",
      );
      assertEquals(
        approveRight(
          finding,
          approver({ roles: ["team_manager"], managedAgencyIds: ["a2"] }),
        ),
        "no",
      );
      assertEquals(approveRight(finding, approver({})), "no");
    },
  );

  await t.step(
    "no role in the run's tenant: not even the finding's person may",
    () => {
      assertEquals(
        approveRight(
          finding,
          approver({ userId: "dana", roles: [], campaignerId: "camp2" }),
        ),
        "no",
      );
    },
  );
});
