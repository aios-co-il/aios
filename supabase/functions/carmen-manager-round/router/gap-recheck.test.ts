import { assertEquals } from "jsr:@std/assert@1";
import { deps } from "../tests/fakes.ts";
import { finding, TENANT, world } from "../tests/fake-world.ts";
import { gapClientIds, recheckPeople } from "./gap-recheck.ts";

/** A missing_phone gap for the person `key`. */
const gap = (key: string, role = "campaigner") =>
  finding({
    kind: "missing_phone",
    fingerprint: `person:${key}`,
    evidence: { recipient_key: key, role },
  });

Deno.test("recheckPeople", async (t) => {
  await t.step(
    "staff come from the staff list, campaigners from the directory, the rest are gone",
    async () => {
      const w = world({
        contacts: { "campaigner:k1": { name: "רון", phone: "050-1111111" } },
      });
      const staff = [
        {
          user_id: "owner",
          name: "דוד",
          phone: null,
          roles: ["owner"],
          managed_agency_ids: [],
        },
      ];
      const result = await recheckPeople(deps(w).directory, TENANT, staff, [
        gap("user:owner", "owner"),
        gap("campaigner:k1"),
        gap("user:left"),
        finding({ kind: "no_campaigner", client_id: "c1" }),
      ]);
      assertEquals(
        result.people.map((p) => [p.key, p.user_id, p.phone, p.role]),
        [
          ["user:owner", "owner", null, "owner"],
          ["campaigner:k1", null, "972501111111", "campaigner"],
        ],
      );
      assertEquals(result.gone, ["user:left"]);
    },
  );
});

Deno.test("gapClientIds: the clients of open no_campaigner gaps", () => {
  assertEquals(
    gapClientIds([
      finding({ kind: "no_campaigner", client_id: "c1" }),
      finding({ kind: "no_contact", client_id: "c2" }),
      gap("user:x"),
    ]),
    ["c1"],
  );
});
