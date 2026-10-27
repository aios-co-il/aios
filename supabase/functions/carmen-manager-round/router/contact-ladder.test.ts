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

Deno.test("contact kinds on the ladder", async (t) => {
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

  await t.step(
    "no_contact reaches the manager after 2 business days, in Sunday's roll-up, and stops",
    () => {
      const start = routeFinding(finding({ kind: "no_contact" }), ctx(team));
      assertEquals(keys(start), [`0:${dana.key}:list:${LIST}`]);
      assertEquals(start.next_action_at, "2026-11-04T07:00:00.000Z");
      const atZero = finding({
        kind: "no_contact",
        escalation_level: 0,
        status: "notified",
        ladder_started_at: LIST,
      });
      const early = routeFinding(
        atZero,
        ctx(team, { now: new Date("2026-11-04T06:00:00Z") }),
      );
      assertEquals([early.escalation_level, early.deliveries], [0, []]);
      const climbed = routeFinding(
        atZero,
        ctx(team, { now: new Date("2026-11-04T08:00:00Z") }),
      );
      assertEquals(climbed.escalation_level, 1);
      assertEquals(keys(climbed), [
        `1:${avi.key}:list:2026-11-08T06:30:00.000Z`,
      ]);
      assertEquals(climbed.next_action_at, null);
    },
  );

  await t.step("observe shows the roll-up and no owner level", () => {
    const decision = routeFinding(
      finding({ kind: "no_contact" }),
      ctx({ mode: "observe" }),
    );
    assertEquals(
      decision.planned_actions?.map((a) => `${a.level}:${a.at}`),
      [`0:2026-11-02T06:30:00.000Z`, `1:2026-11-08T06:30:00.000Z`],
    );
  });
});
