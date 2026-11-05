import { assertEquals } from "jsr:@std/assert@1";
import {
  fakeDb,
  type FakeWorld,
} from "../_shared/carmen/brain-connections/fake-db.ts";
import { resolveBuiltinKeys } from "../_shared/carmen/brain-connections/key-source.ts";
import {
  CLIENT,
  CLIENT_OWNER,
  DMM,
  fakeCtx,
  homeWorld,
  MC,
  MC_OWNER,
  OTHER,
  PROJECT,
  SUPER_ADMIN,
} from "./fake-orgs.ts";
import { HttpError } from "./request.ts";
import { shareBuiltin, unshareBuiltin } from "./share-actions.ts";

/** builtin slug → source kind for `tenant` (null: not configured). */
async function sources(world: FakeWorld, tenant: string) {
  const keys = await resolveBuiltinKeys(fakeDb(world), tenant, PROJECT);
  return Object.fromEntries(keys.map((k) => [k.slug, k.source]));
}

function shareBody(slug: string, target: string) {
  return { builtin_slug: slug, target_tenant_id: target };
}

/** Shares through the gate as `userId` in `tenantId`: 200 or the error status. */
async function share(
  world: FakeWorld,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<number> {
  try {
    await shareBuiltin(await fakeCtx(world, tenantId, userId, body), PROJECT);
    return 200;
  } catch (e) {
    if (e instanceof HttpError) {
      return e.status;
    }
    throw e;
  }
}

/** The shares whose source is `tenant`. */
function sharesFrom(world: FakeWorld, tenant: string) {
  return world.tables.carmen_brain_key_shares.filter(
    (s) => s.source_tenant_id === tenant,
  );
}

// AIO-354: the home organization shares the project keys; a super admin
// shares only from the tenant they act in, and with every organization only
// from a home tenant; a shared-in key is used but never shared on.
Deno.test("share-actions", async (t) => {
  await t.step(
    "the super admin acting in MarketingCaptain shares with an organization they do not belong to",
    async () => {
      const world = homeWorld();
      assertEquals(
        await share(world, MC, SUPER_ADMIN, shareBody("claude", OTHER)),
        200,
      );
      assertEquals(
        sharesFrom(world, MC).filter((s) => s.target_tenant_id === OTHER),
        [
          {
            source_tenant_id: MC,
            target_tenant_id: OTHER,
            builtin_slug: "claude",
            granted_by: SUPER_ADMIN,
          },
        ],
      );
      const other = await sources(world, OTHER);
      assertEquals(other.claude, { kind: "shared", fromTenantId: MC });
      assertEquals(other.cursor, null);
    },
  );

  await t.step(
    "the super admin cannot share Client's own key without acting in Client",
    async () => {
      const world = homeWorld();
      assertEquals(
        await share(world, CLIENT, SUPER_ADMIN, shareBody("claude", MC)),
        403,
      );
      assertEquals(sharesFrom(world, CLIENT), []);
    },
  );

  await t.step(
    "acting elsewhere, the super admin shares MarketingCaptain's brains only as its owner",
    async () => {
      const world = homeWorld();
      world.acting = { [SUPER_ADMIN]: DMM };
      assertEquals(
        await share(world, MC, SUPER_ADMIN, shareBody("claude", OTHER)),
        403,
      );
    },
  );

  await t.step(
    "the super admin acting in a tenant that is not home cannot share the project keys",
    async () => {
      const world = homeWorld();
      world.acting = { [SUPER_ADMIN]: DMM };
      assertEquals(
        await share(world, DMM, SUPER_ADMIN, shareBody("cursor", MC)),
        400,
      );
      assertEquals(sharesFrom(world, DMM), []);
    },
  );

  await t.step(
    "MarketingCaptain's owner shares only with organizations they belong to",
    async () => {
      const world = homeWorld();
      assertEquals(
        await share(world, MC, MC_OWNER, shareBody("grok", CLIENT)),
        200,
      );
      assertEquals((await sources(world, CLIENT)).grok, {
        kind: "shared",
        fromTenantId: MC,
      });
      assertEquals(
        await share(world, MC, MC_OWNER, shareBody("grok", OTHER)),
        403,
      );
    },
  );

  await t.step(
    "unsharing stops that one brain for that organization",
    async () => {
      const world = homeWorld();
      await unshareBuiltin(
        await fakeCtx(world, MC, SUPER_ADMIN, shareBody("codex", DMM)),
      );
      const dmm = await sources(world, DMM);
      assertEquals(dmm.codex, null);
      assertEquals(dmm.cursor, { kind: "shared", fromTenantId: MC });
    },
  );

  await t.step(
    "an organization that is not home cannot share the project keys",
    async () => {
      const world = homeWorld();
      assertEquals(
        await share(world, CLIENT, CLIENT_OWNER, shareBody("cursor", MC)),
        400,
      );
    },
  );
});
