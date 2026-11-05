import { assertEquals } from "jsr:@std/assert@1";
import { BUILTIN_BRAIN_KEYS } from "../_shared/carmen/brain-connections/builtin-keys.ts";
import { builtinState } from "./builtin-state.ts";
import {
  DMM,
  DMM_OWNER,
  fakeCtx,
  homeWorld,
  MC,
  OTHER,
  OTHER_OWNER,
  PROJECT,
  SUPER_ADMIN,
} from "./fake-orgs.ts";

const SLUGS = BUILTIN_BRAIN_KEYS.map((spec) => spec.slug);

// AIO-354: what Carmen settings → מוחות shows each organization.
Deno.test("builtin-state", async (t) => {
  await t.step(
    "the super admin acting in MarketingCaptain sees the project keys and can share with every organization",
    async () => {
      const ctx = await fakeCtx(homeWorld(), MC, SUPER_ADMIN);
      const state = await builtinState(ctx, [], PROJECT);
      assertEquals(
        state.builtins.map((b) => [b.slug, b.source, b.can_share]),
        SLUGS.map((slug) => [slug, "project", true]),
      );
      assertEquals(
        state.builtins.map((b) => b.shared_to),
        SLUGS.map(() => [{ id: DMM, name: "DMM" }]),
      );
      assertEquals(
        state.share_targets.map((t) => t.name),
        ["Client", "DMM", "Other"],
      );
    },
  );

  await t.step(
    "the super admin acting in a tenant that is not home gets no all-organizations list",
    async () => {
      const world = homeWorld();
      world.acting = { [SUPER_ADMIN]: DMM };
      const state = await builtinState(
        await fakeCtx(world, DMM, SUPER_ADMIN),
        [],
        PROJECT,
      );
      assertEquals(state.share_targets, [{ id: MC, name: "MarketingCaptain" }]);
      assertEquals(
        state.builtins.map((b) => b.can_share),
        SLUGS.map(() => false),
      );
    },
  );

  await t.step(
    "DMM uses MarketingCaptain's keys without seeing them or sharing them on",
    async () => {
      const ctx = await fakeCtx(homeWorld(), DMM, DMM_OWNER);
      const state = await builtinState(ctx, [], PROJECT);
      for (const b of state.builtins) {
        assertEquals(
          {
            source: b.source,
            shared_from: b.shared_from,
            key_last4: b.key_last4,
            external_id: b.external_id,
            can_share: b.can_share,
          },
          {
            source: "shared",
            shared_from: { id: MC, name: "MarketingCaptain" },
            key_last4: null,
            external_id: null,
            can_share: false,
          },
        );
      }
    },
  );

  await t.step(
    "any other organization shows every built-in brain as not configured",
    async () => {
      const ctx = await fakeCtx(homeWorld(), OTHER, OTHER_OWNER);
      const state = await builtinState(ctx, [], PROJECT);
      assertEquals(
        state.builtins.map((b) => [b.source, b.can_share]),
        SLUGS.map(() => [null, false]),
      );
      assertEquals(state.share_targets, []);
    },
  );
});
