import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { resolveBuiltinKeys } from "../_shared/carmen/brain-connections/key-source.ts";
import { fakeCtx, fakeDb, type FakeWorld } from "./fake-db.ts";
import {
  CLIENT,
  CLIENT_OWNER,
  DMM,
  homeWorld,
  MC,
  MC_OWNER,
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

/** The status of the HttpError `run` rejects with. */
async function rejectedStatus(run: () => Promise<unknown>): Promise<number> {
  const error = await assertRejects(run, HttpError);
  return error.status;
}

// AIO-354: the home organization shares the project keys; a shared-in key is
// used but never shared on; a tenant that is not home has no project keys.
Deno.test("share-actions", async (t) => {
  await t.step(
    "the super admin in MarketingCaptain shares with an organization they do not belong to",
    async () => {
      const world = homeWorld();
      await shareBuiltin(
        fakeCtx(world, MC, SUPER_ADMIN, shareBody("claude", CLIENT)),
        PROJECT,
      );
      assertEquals(
        world.tables.carmen_brain_key_shares.filter(
          (s) => s.target_tenant_id === CLIENT,
        ),
        [
          {
            source_tenant_id: MC,
            target_tenant_id: CLIENT,
            builtin_slug: "claude",
            granted_by: SUPER_ADMIN,
          },
        ],
      );
      const client = await sources(world, CLIENT);
      assertEquals(client.claude, { kind: "shared", fromTenantId: MC });
      assertEquals(client.cursor, null);
    },
  );

  await t.step(
    "MarketingCaptain's owner shares only with organizations they belong to",
    async () => {
      const world = homeWorld();
      await shareBuiltin(
        fakeCtx(world, MC, MC_OWNER, shareBody("grok", CLIENT)),
        PROJECT,
      );
      assertEquals((await sources(world, CLIENT)).grok, {
        kind: "shared",
        fromTenantId: MC,
      });
      const status = await rejectedStatus(() =>
        shareBuiltin(
          fakeCtx(world, MC, MC_OWNER, shareBody("grok", DMM)),
          PROJECT,
        ),
      );
      assertEquals(status, 403);
    },
  );

  await t.step(
    "unsharing stops that one brain for that organization",
    async () => {
      const world = homeWorld();
      await unshareBuiltin(
        fakeCtx(world, MC, SUPER_ADMIN, shareBody("codex", DMM)),
      );
      const dmm = await sources(world, DMM);
      assertEquals(dmm.codex, null);
      assertEquals(dmm.cursor, { kind: "shared", fromTenantId: MC });
    },
  );

  await t.step(
    "a receiving organization cannot share the brain on, even as super admin",
    async () => {
      const world = homeWorld();
      const status = await rejectedStatus(() =>
        shareBuiltin(
          fakeCtx(world, DMM, SUPER_ADMIN, shareBody("cursor", MC)),
          PROJECT,
        ),
      );
      assertEquals(status, 400);
      assertEquals(
        world.tables.carmen_brain_key_shares.filter(
          (s) => s.source_tenant_id === DMM,
        ),
        [],
      );
    },
  );

  await t.step(
    "an organization that is not home cannot share the project keys",
    async () => {
      const world = homeWorld();
      const status = await rejectedStatus(() =>
        shareBuiltin(
          fakeCtx(world, CLIENT, CLIENT_OWNER, shareBody("cursor", DMM)),
          PROJECT,
        ),
      );
      assertEquals(status, 400);
    },
  );
});
