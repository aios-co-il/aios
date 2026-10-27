import { assertEquals } from "jsr:@std/assert@1";
import { CLIENT, GROUP } from "../../tests/group-fixtures.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadCardEntries } from "./card-entries.ts";
import { loadGroupHistories } from "./messages.ts";
import { loadStaffKeys } from "./staff-keys.ts";

const since = new Date("2026-11-01T00:00:00Z");

Deno.test("loadGroupHistories", async (t) => {
  await t.step(
    "asks the service function for this tenant and parses messages",
    async () => {
      const row = {
        client_id: CLIENT,
        client_name: "א",
        group_id: GROUP,
        group_name: "ג",
        messages: [
          {
            id: "b",
            at: "2026-11-01T10:00:00Z",
            out: true,
            key: null,
            text: "שני",
          },
          {
            id: "a",
            at: "2026-11-01T09:00:00Z",
            out: false,
            key: "521111111",
            text: "ראשון",
          },
          { at: "2026-11-01T09:30:00Z", text: "בלי מזהה" },
        ],
      };
      const { db, calls } = recordingClient(() => [row]);
      const [history] = await loadGroupHistories(db, {
        tenantId: "t1",
        since,
        clientIds: [CLIENT],
      });
      assertEquals(
        history.messages.map((m) => m.id),
        ["a", "b"],
      );
      assertEquals(calls[0].path, "rpc/get_client_group_digest_messages");
      assertEquals(calls[0].body, {
        p_tenant_id: "t1",
        p_since: since.toISOString(),
        p_client_ids: [CLIENT],
        p_per_group: 60,
      });
    },
  );
});

Deno.test("loadCardEntries", async (t) => {
  await t.step(
    "reads the tenant's own entries of the clients in play",
    async () => {
      const { db, calls } = recordingClient(() => []);
      await loadCardEntries(db, { tenantId: "t1", clientIds: [CLIENT], since });
      const query = calls[0].query;
      assertEquals(calls[0].path, "client_updates");
      assertEquals(query.get("tenant_id"), "eq.t1");
      assertEquals(query.get("client_id"), `in.(${CLIENT})`);
    },
  );

  await t.step("no client: no read", async () => {
    const { db, calls } = recordingClient(() => []);
    assertEquals(
      await loadCardEntries(db, { tenantId: "t1", clientIds: [], since }),
      [],
    );
    assertEquals(calls, []);
  });
});

Deno.test("loadStaffKeys", async (t) => {
  await t.step(
    "match keys of the tenant's and its agency partners' staff and lines",
    async () => {
      const { db, calls } = recordingClient((call) => {
        switch (call.path) {
          case "agency_tenant_access":
            return [{ source_tenant_id: "t2", accessing_tenant_id: "t1" }];
          case "user_roles":
            return [{ user_id: "u1" }];
          case "profiles":
            return [
              {
                id: "u1",
                full_name: "",
                phone: null,
                campaigner_id: null,
                campaigners: {
                  phone: "050-2222222",
                  tenant_id: "t1",
                  active: true,
                },
              },
            ];
          case "campaigners":
            return [{ phone: "+972 53 333 3333" }];
          case "tenant_integrations":
            return [
              { settings: { phone_number: "972544444444" } },
              { settings: null },
            ];
          default:
            return [];
        }
      });
      const keys = await loadStaffKeys(db, "t1");
      assertEquals([...keys].sort(), ["502222222", "533333333", "544444444"]);
      const roles = calls.find((c) => c.path === "user_roles");
      assertEquals(roles?.query.get("tenant_id"), "in.(t1,t2)");
    },
  );
});
