import { assertEquals } from "jsr:@std/assert@1";
import { finding } from "../tests/fake-world.ts";
import {
  avi,
  client,
  ctx,
  dana,
  keys,
  SUNDAY_10,
  team,
} from "../tests/route-fixtures.ts";
import { routeFinding } from "./route.ts";

Deno.test("routeFinding in team mode climbs the ladder", async (t) => {
  await t.step("a new non-urgent finding waits for Monday's 08:30 list", () => {
    const decision = routeFinding(finding({ client_id: "c1" }), ctx(team));
    assertEquals(decision.status, "notified");
    assertEquals(decision.escalation_level, 0);
    assertEquals(keys(decision), ["0:user:dana:list:2026-11-02T06:30:00.000Z"]);
    assertEquals(decision.next_action_at, "2026-11-02T11:00:00.000Z");
    assertEquals(decision.owner_user_id, "dana");
  });

  await t.step("a complaint reaches campaigner and manager at once", () => {
    const decision = routeFinding(
      finding({ kind: "client_complaint" }),
      ctx(team),
    );
    assertEquals(keys(decision), [
      `0:user:dana:now:${new Date(SUNDAY_10).toISOString()}`,
      `0:user:avi:now:${new Date(SUNDAY_10).toISOString()}`,
    ]);
    assertEquals(decision.next_action_at, "2026-11-01T12:00:00.000Z");
  });

  await t.step(
    "an urgent finding at night waits for the next business hour",
    () => {
      const night = routeFinding(
        finding({ kind: "client_complaint" }),
        ctx(team, { now: new Date("2026-11-01T18:00:00Z") }),
      );
      assertEquals(
        night.deliveries.map((d) => d.not_before),
        ["2026-11-02T07:00:00.000Z", "2026-11-02T07:00:00.000Z"],
      );
    },
  );

  await t.step(
    "a Shabbat-critical alert goes at once, also to the owner",
    () => {
      const saturday = new Date("2026-10-31T10:00:00Z");
      const alert = finding({
        kind: "platform_alert",
        severity: "critical",
        evidence: { alert_type: "account_disabled" },
      });
      const decision = routeFinding(alert, ctx(team, { now: saturday }));
      assertEquals(keys(decision), [
        `0:user:dana:now:${saturday.toISOString()}`,
        `2:user:david:now:${saturday.toISOString()}`,
      ]);
    },
  );

  await t.step(
    "level 1 goes to the manager after 4 business hours, not before",
    () => {
      const atZero = finding({
        escalation_level: 0,
        status: "notified",
        ladder_started_at: "2026-11-02T06:30:00Z",
      });
      const early = routeFinding(
        atZero,
        ctx(team, { now: new Date("2026-11-02T10:00:00Z") }),
      );
      assertEquals(
        [early.escalation_level, early.deliveries, early.planned_actions],
        [0, [], null],
      );
      const due = routeFinding(
        atZero,
        ctx(team, { now: new Date("2026-11-02T11:00:00Z") }),
      );
      assertEquals(due.escalation_level, 1);
      assertEquals(keys(due), ["1:user:avi:now:2026-11-02T11:00:00.000Z"]);
      assertEquals(due.next_action_at, "2026-11-04T11:00:00.000Z");
    },
  );

  await t.step(
    "level 2 of a non-urgent finding joins the morning brief",
    () => {
      const atOne = finding({
        escalation_level: 1,
        status: "notified",
        ladder_started_at: "2026-11-02T06:30:00Z",
      });
      const decision = routeFinding(
        atOne,
        ctx(team, { now: new Date("2026-11-04T11:00:00Z") }),
      );
      assertEquals(
        [
          decision.escalation_level,
          decision.deliveries,
          decision.next_action_at,
        ],
        [2, [], null],
      );
      assertEquals(decision.planned_actions?.[0]?.action, "brief");
    },
  );
});

Deno.test(
  "routeFinding never tells the same person twice and falls back upwards",
  async (t) => {
    await t.step(
      "no campaigner: the manager first, then silence at level 1",
      () => {
        const people = { client, campaigners: [], managers: [avi] };
        assertEquals(
          keys(routeFinding(finding(), ctx(team, { people }))).map((k) =>
            k.split(":").slice(0, 3).join(":"),
          ),
          ["0:user:avi"],
        );
        const atZero = finding({
          escalation_level: 0,
          status: "notified",
          ladder_started_at: "2026-11-02T06:30:00Z",
        });
        assertEquals(
          routeFinding(
            atZero,
            ctx(team, { people, now: new Date("2026-11-02T11:00:00Z") }),
          ).deliveries,
          [],
        );
      },
    );

    await t.step(
      "nobody assigned: the owner hears once, even when critical",
      () => {
        const people = { client, campaigners: [], managers: [] };
        const decision = routeFinding(
          finding({ severity: "critical" }),
          ctx(team, { people }),
        );
        assertEquals(
          decision.deliveries.map((d) => `${d.level}:${d.recipient_key}`),
          ["0:user:david"],
        );
      },
    );

    await t.step("a person without a phone is recorded as in-app only", () => {
      const people = {
        client,
        campaigners: [{ ...dana, phone: null }],
        managers: [avi],
      };
      const [row] = routeFinding(finding(), ctx(team, { people })).deliveries;
      assertEquals([row.status, row.channel], ["no_phone", "in_app"]);
    });
  },
);
