import { assertEquals } from "jsr:@std/assert@1";
import { finding } from "../tests/fake-world.ts";
import { ctx, keys, SINCE, SUNDAY_10, team } from "../tests/route-fixtures.ts";
import { routeFinding } from "./route.ts";

Deno.test("routeFinding holds and previews without sending", async (t) => {
  await t.step("observe records the team ladder and sends nothing", () => {
    const decision = routeFinding(
      finding({ client_id: "c1" }),
      ctx({ mode: "observe" }),
    );
    assertEquals(decision.status, null);
    assertEquals(decision.deliveries, []);
    assertEquals(
      decision.planned_actions?.map((a) => [a.level, a.action, a.to, a.at]),
      [
        [0, "notify", ["דנה כהן"], "2026-11-02T06:30:00.000Z"],
        [1, "notify", ["אבי לוי"], "2026-11-02T11:00:00.000Z"],
        [2, "brief", ["דוד"], "2026-11-04T11:00:00.000Z"],
      ],
    );
  });

  await t.step(
    "a disabled kind, a missing stamp, an older event and the floor hold",
    () => {
      const reason = (d: ReturnType<typeof routeFinding>) =>
        d.planned_actions?.[0]?.reason;
      assertEquals(
        reason(
          routeFinding(
            finding(),
            ctx({ ...team, kinds: { cost_spike: { enabled: false } } }),
          ),
        ),
        "kind_off",
      );
      assertEquals(
        reason(routeFinding(finding(), ctx({ mode: "team" }))),
        "before_notify_since",
      );
      assertEquals(
        reason(
          routeFinding(
            finding({ source_event_at: "2026-10-30T23:00:00Z" }),
            ctx(team),
          ),
        ),
        "before_notify_since",
      );
      const floored = routeFinding(
        finding(),
        ctx(team, { floors: { cost_spike: "2026-11-01T07:30:00Z" } }),
      );
      assertEquals(reason(floored), "before_notify_since");
      assertEquals(floored.deliveries, []);
    },
  );
});

Deno.test("routeFinding at owner level (david_only, ops kinds)", async (t) => {
  const davidOnly = { mode: "david_only", notify_since: SINCE };

  await t.step(
    "non-urgent waits for the 08:00 brief; urgent goes at once",
    () => {
      const quiet = routeFinding(finding(), ctx(davidOnly));
      assertEquals(
        [
          quiet.escalation_level,
          quiet.deliveries,
          quiet.planned_actions?.[0]?.at,
        ],
        [2, [], "2026-11-02T06:00:00.000Z"],
      );
      const urgent = routeFinding(
        finding({ kind: "client_complaint" }),
        ctx(davidOnly),
      );
      assertEquals(keys(urgent), [
        `2:user:david:now:${new Date(SUNDAY_10).toISOString()}`,
      ]);
    },
  );

  await t.step(
    "a routed finding is left alone unless it became critical",
    () => {
      const routed = finding({ escalation_level: 2, status: "notified" });
      const again = routeFinding(routed, ctx(davidOnly));
      assertEquals([again.deliveries, again.planned_actions], [[], null]);
      assertEquals(
        routeFinding({ ...routed, severity: "critical" }, ctx(davidOnly))
          .deliveries.length,
        1,
      );
    },
  );

  await t.step(
    "a finding left at level 0 by team mode moves up to the brief recipients",
    () => {
      const decision = routeFinding(
        finding({ escalation_level: 0, status: "notified" }),
        ctx(davidOnly),
      );
      assertEquals(
        [decision.escalation_level, decision.planned_actions?.[0]?.to],
        [2, ["דוד"]],
      );
    },
  );

  await t.step("team mode sends data gaps to the owner level", () => {
    const decision = routeFinding(finding({ kind: "data_gap" }), ctx(team));
    assertEquals(
      [decision.escalation_level, decision.deliveries.length],
      [2, 0],
    );
  });
});
