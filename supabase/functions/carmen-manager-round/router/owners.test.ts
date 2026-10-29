import { assertEquals } from "jsr:@std/assert@1";
import { fakeDirectory } from "../tests/fake-directory.ts";
import { finding, TENANT, world } from "../tests/fake-world.ts";
import { client, dana } from "../tests/route-fixtures.ts";
import { resolveOwners } from "./owners.ts";

const manager = {
  user_id: "avi",
  name: "אבי",
  phone: "0502222222",
  roles: ["team_manager"],
  managed_agency_ids: ["a1"],
};
const owner = { ...manager, user_id: "david", roles: ["owner"] };
const agencyOwner = { ...manager, user_id: "ruth", roles: ["agency_owner"] };
const people = new Map([["c1", { client, campaigners: [dana], managers: [] }]]);
/** A finding of client c1 owned by `owner` (attributed when there is one), with id `f-<owner>`. */
const call = (owner: string | null, kind = "contact_not_logged") =>
  finding({
    client_id: "c1",
    kind,
    owner_user_id: owner,
    id: `f-${owner}`,
    evidence: { attributed: owner !== null },
  });

Deno.test("resolveOwners", async (t) => {
  const w = world({
    staff: [manager, owner, agencyOwner],
    contacts: { "user:noa": { name: "נועה", phone: "050-444-4444" } },
  });
  const owners = await resolveOwners(fakeDirectory(w), {
    tenantId: TENANT,
    findings: [
      call("dana"),
      call("avi"),
      call("david"),
      call("ruth"),
      call("noa"),
      call("gone"),
      call(null),
      { ...call("dana", "no_contact"), id: "f-other" },
      { ...call("dana"), id: "f-default", evidence: { attributed: false } },
    ],
    people,
    staff: w.staff,
  });

  await t.step("a campaigner of the client, staff, then another login", () => {
    assertEquals(owners.get("f-dana"), dana);
    assertEquals(
      ["f-avi", "f-david", "f-ruth"].map((id) => {
        const recipient = owners.get(id);
        return `${recipient?.key}:${recipient?.role}`;
      }),
      ["user:avi:manager", "user:david:owner", "user:ruth:owner"],
    );
    assertEquals(owners.get("f-noa"), {
      key: "user:noa",
      user_id: "noa",
      name: "נועה",
      phone: "972504444444",
      role: "campaigner",
    });
  });

  await t.step(
    "nobody for an unreachable person, an unattributed call or another kind",
    () => {
      assertEquals(
        ["f-gone", "f-null", "f-other", "f-default"].map((id) =>
          owners.has(id),
        ),
        [false, false, false, false],
      );
    },
  );
});
