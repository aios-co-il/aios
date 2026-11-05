import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { guardDb } from "../client-send/fake-guard-db.ts";
import {
  clientGroupAudienceNote,
  findGroupClientName,
  UNKNOWN_GROUP_CLIENT,
} from "./client-group-audience.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const GROUP_CHAT = "120363410431767319@g.us";
const GROUP_ROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "33333333-3333-4333-8333-333333333333";

const groups = [
  { id: GROUP_ROW, tenant_id: TENANT, group_chat_id: GROUP_CHAT },
];
const clients = [{ id: CLIENT, name: "Detailit" }];

/** The audience lookup over a group linked to these clients. */
async function lookup(
  input: {
    links?: Array<string>;
    tables?: Record<string, Array<Record<string, unknown>>>;
    failing?: Array<string>;
  } = {},
) {
  const { db } = guardDb({
    tables: input.tables ?? { whatsapp_groups: groups, clients },
    rpcs: { whatsapp_group_client_ids: () => input.links ?? [CLIENT] },
    failing: input.failing,
  });
  return await findGroupClientName(db, {
    tenantId: TENANT,
    chatId: GROUP_CHAT,
  });
}

Deno.test("findGroupClientName", async (t) => {
  await t.step("names the group's client", async () => {
    assertEquals(await lookup(), "Detailit");
  });

  await t.step("a staff group or an unregistered group is none", async () => {
    assertEquals(await lookup({ links: [] }), null);
    assertEquals(await lookup({ tables: { clients } }), null);
  });

  await t.step("a failed lookup is answered as a client's group", async () => {
    for (const failing of [
      "whatsapp_groups",
      "whatsapp_group_client_ids",
      "clients",
    ]) {
      assertEquals(
        await lookup({ failing: [failing] }),
        UNKNOWN_GROUP_CLIENT,
        failing,
      );
    }
  });
});

Deno.test("clientGroupAudienceNote keeps to the client, positively", () => {
  const note = clientGroupAudienceNote("Detailit");
  assertStringIncludes(note, "הלקוח רואה כל מה שתכתבי כאן");
  assertStringIncludes(note, "ורק על Detailit");
  assertStringIncludes(note, "ביצענו עבודת אופטימיזציה ואנחנו על זה");
});
