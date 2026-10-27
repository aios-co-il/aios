import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../tests/recording-client.ts";
import { createPeopleDirectory } from "./directory.ts";

const T = "11111111-1111-4111-8111-111111111111";

Deno.test(
  "createPeopleDirectory stays inside the routing tenant",
  async (t) => {
    await t.step(
      "a client is found only in the tenant or an agency shared with it",
      async () => {
        const { db, calls } = recordingClient((call) =>
          call.path === "agency_tenant_access"
            ? [{ agency_id: "a9" }]
            : { id: "c1", agency_id: "a9", name: "לקוח" },
        );
        assertEquals(await createPeopleDirectory(db).client(T, "c1"), {
          id: "c1",
          agency_id: "a9",
          name: "לקוח",
        });
        assertEquals(calls[0].query.get("accessing_tenant_id"), `eq.${T}`);
        assertEquals(
          calls[1].query.get("or"),
          `(tenant_id.eq.${T},agency_id.in.(a9))`,
        );
      },
    );

    await t.step(
      "campaigners are the tenant's active ones, with their login profile",
      async () => {
        const { db, calls } = recordingClient((call) =>
          call.path === "client_team"
            ? [
                {
                  campaigner_id: "k1",
                  role_on_account: "קמפיינרית",
                  start_date: null,
                  end_date: "2026-12-31",
                  campaigners: {
                    full_name: "דנה",
                    phone: "050",
                    active: true,
                    tenant_id: T,
                  },
                },
              ]
            : [
                {
                  id: "u1",
                  full_name: "דנה כהן",
                  phone: "0501111111",
                  campaigner_id: "k1",
                },
              ],
        );
        const [dana] = await createPeopleDirectory(db).campaigners(T, "c1");
        assertEquals(dana, {
          campaigner_id: "k1",
          user_id: "u1",
          name: "דנה כהן",
          phone: "0501111111",
          campaign_role: true,
          start_date: null,
          end_date: "2026-12-31",
        });
        assertEquals(
          [
            calls[0].query.get("campaigners.tenant_id"),
            calls[0].query.get("campaigners.active"),
          ],
          [`eq.${T}`, "eq.true"],
        );
      },
    );

    await t.step(
      "staff are the tenant's owners, agency owners and team managers",
      async () => {
        const { db, calls } = recordingClient((call) => {
          if (call.path === "user_roles") {
            return [
              { user_id: "u1", role: "owner" },
              { user_id: "u2", role: "team_manager" },
            ];
          }
          if (call.path === "profiles") {
            return [
              {
                id: "u1",
                full_name: "דוד",
                phone: "0503",
                campaigner_id: null,
                campaigners: null,
              },
              {
                id: "u2",
                full_name: "אבי",
                phone: null,
                campaigner_id: "k2",
                campaigners: { phone: "0504", tenant_id: T, active: true },
              },
            ];
          }
          return [{ user_id: "u2", agency_id: "a1" }];
        });
        const staff = await createPeopleDirectory(db).staff(T);
        // u2's number is only on the campaigner record the profile links to.
        assertEquals(
          staff.map((s) => [s.user_id, s.roles, s.managed_agency_ids, s.phone]),
          [
            ["u1", ["owner"], [], "0503"],
            ["u2", ["team_manager"], ["a1"], "0504"],
          ],
        );
        assertEquals(
          calls.find((c) => c.path === "profiles")?.query.get("select"),
          "id,full_name,phone,campaigner_id,campaigners(phone,tenant_id,active)",
        );
        assertEquals(
          [calls[0].query.get("tenant_id"), calls[0].query.get("role")],
          [`eq.${T}`, "in.(owner,agency_owner,team_manager)"],
        );
      },
    );
  },
);
