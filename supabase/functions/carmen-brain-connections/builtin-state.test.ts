import { assertEquals } from "jsr:@std/assert@1";
import { BUILTIN_BRAIN_KEYS } from "../_shared/carmen/brain-connections/builtin-keys.ts";
import { builtinState } from "./builtin-state.ts";
import { fakeCtx } from "./fake-db.ts";
import {
  CLIENT,
  CLIENT_OWNER,
  DMM,
  DMM_OWNER,
  homeWorld,
  MC,
  PROJECT,
  SUPER_ADMIN,
} from "./fake-orgs.ts";

const SLUGS = BUILTIN_BRAIN_KEYS.map((spec) => spec.slug);

// AIO-354: what Carmen settings → מוחות shows each organization.
Deno.test("builtin-state", async (t) => {
  await t.step(
    "MarketingCaptain runs on the project keys and the super admin can share with every organization",
    async () => {
      const state = await builtinState(
        fakeCtx(homeWorld(), MC, SUPER_ADMIN),
        [],
        PROJECT,
      );
      assertEquals(
        state.builtins.map((b) => [b.slug, b.source, b.can_share]),
        SLUGS.map((slug) => [slug, "project", true]),
      );
      assertEquals(
        state.builtins.map((b) => b.shared_to),
        SLUGS.map(() => [{ id: DMM, name: "DMM" }]),
      );
      assertEquals(state.share_targets, [
        { id: CLIENT, name: "Client" },
        { id: DMM, name: "DMM" },
      ]);
    },
  );

  await t.step(
    "DMM uses MarketingCaptain's keys without seeing them or sharing them on",
    async () => {
      const state = await builtinState(
        fakeCtx(homeWorld(), DMM, DMM_OWNER),
        [],
        PROJECT,
      );
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
      const state = await builtinState(
        fakeCtx(homeWorld(), CLIENT, CLIENT_OWNER),
        [],
        PROJECT,
      );
      assertEquals(
        state.builtins.map((b) => [b.source, b.can_share]),
        SLUGS.map(() => [null, false]),
      );
      assertEquals(state.share_targets, []);
    },
  );
});
