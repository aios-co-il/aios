import { assertEquals } from "jsr:@std/assert@1";
import type { Recipient } from "../findings/types.ts";
import { finding } from "../tests/fake-world.ts";
import { avi, ctx, dana, keys, team } from "../tests/route-fixtures.ts";
import { routeFinding } from "./route.ts";

const noa: Recipient = {
  key: "user:noa",
  user_id: "noa",
  name: "נועה",
  phone: "972504444444",
  role: "campaigner",
};
// Monday 2026-11-02 08:30 Israel time, the list the ladder starts with.
const LIST = "2026-11-02T06:30:00.000Z";

Deno.test("an owner-first kind starts with its owner", async (t) => {
  await t.step(
    "an attributed unlogged call goes to the caller, then the manager",
    () => {
      const call = finding({
        kind: "contact_not_logged",
        owner_user_id: "noa",
      });
      const decision = routeFinding(call, ctx(team, { owner: noa }));
      assertEquals(keys(decision), [`0:user:noa:list:${LIST}`]);
      assertEquals(decision.owner_user_id, "noa");
      const atOne = finding({
        kind: "contact_not_logged",
        owner_user_id: "noa",
        escalation_level: 0,
        status: "notified",
        ladder_started_at: LIST,
      });
      const climbed = routeFinding(
        atOne,
        ctx(team, { owner: noa, now: new Date("2026-11-02T12:00:00Z") }),
      );
      assertEquals(
        climbed.deliveries.map((d) => d.recipient_key),
        [avi.key],
      );
    },
  );

  await t.step("an office-line call goes to the client's campaigners", () => {
    const call = finding({ kind: "contact_not_logged" });
    const decision = routeFinding(call, ctx(team, { owner: null }));
    assertEquals(keys(decision), [`0:${dana.key}:list:${LIST}`]);
    assertEquals(decision.owner_user_id, "dana");
  });
});
