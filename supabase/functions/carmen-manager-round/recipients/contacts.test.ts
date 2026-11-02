import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../tests/recording-client.ts";
import { loadContacts } from "./contacts.ts";

const T = "11111111-1111-4111-8111-111111111111";

Deno.test("loadContacts", async (t) => {
  await t.step(
    "the tenant's active campaigners, by login or record; others are left out",
    async () => {
      const { db, calls } = recordingClient((call) =>
        call.path === "profiles"
          ? [
              {
                id: "u1",
                full_name: "דנה",
                phone: null,
                campaigner_id: "k1",
                campaigners: { phone: "0501", tenant_id: T, active: true },
              },
              {
                id: "u2",
                full_name: "זרה",
                phone: "0502",
                campaigner_id: "k2",
                campaigners: { phone: null, tenant_id: "t2", active: true },
              },
            ]
          : [{ id: "k3", full_name: "רון", phone: null }],
      );
      const contacts = await loadContacts(db, T, [
        "user:u1",
        "user:u2",
        "campaigner:k3",
      ]);
      assertEquals(
        [...contacts],
        [
          ["user:u1", { name: "דנה", phone: "0501" }],
          ["campaigner:k3", { name: "רון", phone: null }],
        ],
      );
      const records = calls.find((c) => c.path === "campaigners")?.query;
      assertEquals(
        [records?.get("tenant_id"), records?.get("active"), records?.get("id")],
        [`eq.${T}`, "eq.true", "in.(k3)"],
      );
    },
  );

  await t.step("no keys of a kind, no query for it", async () => {
    const { db, calls } = recordingClient();
    await loadContacts(db, T, []);
    assertEquals(calls, []);
  });
});
