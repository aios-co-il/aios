import { assertEquals } from "jsr:@std/assert@1";
import {
  actionRow,
  answer,
  CLAIM,
  ME,
  OTHER_TENANT,
  post,
  TENANT,
  world,
} from "./handler.test-fixture.ts";

const CARMEN = "99999999-9999-4999-8999-999999999999";

/** The claim's permission for this action, with the org's Carmen and these permissions rows. */
async function claimedPermission(
  tool: string,
  rows: Array<Record<string, unknown>>,
): Promise<unknown> {
  const { deps, tables } = world(actionRow({ tool }));
  tables.ai_agents = [{ id: CARMEN, tenant_id: TENANT, is_carmen: true }];
  tables.carmen_command_center_access = rows;

  const { body } = await answer(post(CLAIM), deps);
  return body.sensitive_screenshots_allowed;
}

/** My permissions row for the org's Carmen with the switch as given. */
function myRow(on: boolean, overrides = {}) {
  return {
    tenant_id: TENANT,
    agent_id: CARMEN,
    user_id: ME,
    sensitive_screenshots: on,
    ...overrides,
  };
}

Deno.test("the claim's screenshot permission", async (t) => {
  await t.step(
    "a screenshot learns the manager's switch for its user",
    async () => {
      assertEquals(
        await claimedPermission("browser_screenshot", [myRow(true)]),
        true,
      );
      assertEquals(
        await claimedPermission("browser_screenshot", [myRow(false)]),
        false,
      );
    },
  );

  await t.step(
    "off without a row, or with another user's or org's",
    async () => {
      assertEquals(await claimedPermission("browser_screenshot", []), false);
      assertEquals(
        await claimedPermission("browser_screenshot", [
          myRow(true, { user_id: "22222222-2222-4222-8222-222222222222" }),
          myRow(true, { tenant_id: OTHER_TENANT }),
        ]),
        false,
      );
    },
  );

  await t.step("no other tool carries it, whatever the switch", async () => {
    for (const tool of ["browser_read_page", "browser_click", "browser_type"]) {
      assertEquals(await claimedPermission(tool, [myRow(true)]), false, tool);
    }
  });
});
