import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { guardDb, resolved } from "../client-send/fake-guard-db.ts";
import {
  findGroupClientAuthor,
  forwardClientRequest,
} from "./client-intake.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT = "44444444-4444-4444-8444-444444444444";
const CLIENT_PHONE = "972521112233";

Deno.test("findGroupClientAuthor", async (t) => {
  /** The author lookup when the phone resolves as given. */
  const find = (author: Record<string, unknown>, failing: Array<string> = []) =>
    findGroupClientAuthor(
      guardDb({
        recipients: { [CLIENT_PHONE]: author },
        rpcs: { whatsapp_group_client_ids: () => [CLIENT] },
        failing,
      }).db,
      { tenantId: TENANT, groupId: GROUP, phone: CLIENT_PHONE },
    );

  await t.step(
    "the group's own client, by the card or contact phone",
    async () => {
      assertEquals(await find(resolved("client", [CLIENT])), {
        clientIds: [CLIENT],
      });
      assertEquals(await find(resolved("client_contact", [CLIENT])), {
        clientIds: [CLIENT],
      });
    },
  );

  await t.step("anyone else is not", async () => {
    assertEquals(await find(resolved("client_contact", [OTHER_CLIENT])), null);
    assertEquals(await find(resolved("staff")), null);
    assertEquals(await find(resolved("lead")), null);
    assertEquals(
      await find(resolved("client", [CLIENT], { sender_staff: true })),
      null,
      "the tenant's own staff never take the client path",
    );
  });

  await t.step("a failed lookup is no client", async () => {
    assertEquals(
      await find(resolved("client", [CLIENT]), ["whatsapp_group_client_ids"]),
      null,
    );
  });
});

Deno.test("forwardClientRequest", async (t) => {
  /** Forwards over these tables and records each alert. */
  async function forward(
    tables: Record<string, Array<Record<string, unknown>>>,
    rpcs: Record<string, () => unknown> = {},
  ) {
    const alerts: Array<{ phone: string; message: string }> = [];
    const delivered = await forwardClientRequest({
      db: guardDb({ tables, rpcs }).db,
      tenantId: TENANT,
      groupId: GROUP,
      clientIds: [CLIENT],
      senderName: "יוסי",
      senderPhone: CLIENT_PHONE,
      message: "כרמן, אפשר להעלות את התקציב?",
      sendAlert: (phone, message) => {
        alerts.push({ phone, message });
        return Promise.resolve(true);
      },
    });
    return { delivered, alerts };
  }

  const context = {
    whatsapp_groups: [{ id: GROUP, group_name: "שיווק מנצח ל DetailIT" }],
    clients: [{ id: CLIENT, name: "Detailit" }],
  };

  await t.step("to the client's active campaigners", async () => {
    const { delivered, alerts } = await forward({
      ...context,
      client_team: [
        { campaigners: { phone: "972545612156", active: true } },
        { campaigners: { phone: "972500000000", active: false } },
      ],
    });
    assertEquals(delivered, 1);
    assertEquals(alerts[0].phone, "972545612156");
    assertStringIncludes(alerts[0].message, "Detailit");
    assertStringIncludes(alerts[0].message, "אפשר להעלות את התקציב?");
  });

  await t.step(
    "to the tenant's report list when no campaigner has a phone",
    async () => {
      const { alerts } = await forward(
        { ...context, client_team: [], carmen_report_recipients: [] },
        {
          carmen_report_staff: () => [
            {
              user_id: "u-1",
              full_name: "דוד",
              phone: "972507677613",
              is_owner: true,
            },
          ],
          carmen_report_client_phones: () => [],
        },
      );
      assertEquals(
        alerts.map((alert) => alert.phone),
        ["972507677613"],
      );
    },
  );
});
