import { assertEquals } from "jsr:@std/assert@1";
import { guardDb } from "../client-send/fake-guard-db.ts";
import {
  accessFlagsFor,
  GROUP_REPLY_LEVELS,
  groupReplyLevel,
  replyLevelOfRow,
} from "./group-reply-level.ts";
import { loadGroupReplyLevel } from "./load-group-reply-level.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

Deno.test("group reply levels", async (t) => {
  await t.step("each level round-trips through its stored flags", () => {
    for (const level of GROUP_REPLY_LEVELS) {
      assertEquals(replyLevelOfRow(accessFlagsFor(level)), level);
    }
  });

  await t.step("no row answers staff; the strictest row wins", () => {
    assertEquals(groupReplyLevel([]), "staff");
    assertEquals(
      groupReplyLevel([accessFlagsFor("client"), accessFlagsFor("staff")]),
      "staff",
    );
    assertEquals(
      groupReplyLevel([
        accessFlagsFor("client"),
        accessFlagsFor("automations_only"),
      ]),
      "automations_only",
    );
  });
});

Deno.test("loadGroupReplyLevel", async (t) => {
  /** The level read over these access rows. */
  const load = (
    rows: Array<Record<string, unknown>>,
    failing: Array<string> = [],
  ) =>
    loadGroupReplyLevel(
      guardDb({ tables: { carmen_client_group_access: rows }, failing }).db,
      { tenantId: TENANT, groupId: GROUP },
    );

  await t.step("reads the tenant's rows of this group", async () => {
    const row = (tenant: string, level: "client" | "automations_only") => ({
      tenant_id: tenant,
      whatsapp_group_id: GROUP,
      ...accessFlagsFor(level),
    });
    assertEquals(await load([row(TENANT, "client")]), "client");
    assertEquals(
      await load([
        row("22222222-2222-4222-8222-222222222222", "automations_only"),
      ]),
      "staff",
      "another tenant's row does not count",
    );
  });

  await t.step("fails closed when unreadable", async () => {
    assertEquals(
      await load([], ["carmen_client_group_access"]),
      "automations_only",
    );
  });
});
