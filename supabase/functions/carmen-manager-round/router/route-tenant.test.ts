import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { withConsoleErrors } from "../../_shared/testing/console-errors.ts";
import { deps } from "../tests/fakes.ts";
import {
  delivery,
  finding,
  TENANT,
  type World,
  world,
} from "../tests/fake-world.ts";
import { routeTenant } from "./route-tenant.ts";

const team = resolveManagerSettings({
  manager: { mode: "team", notify_since: "2026-10-01T00:00:00Z" },
});
const owner = {
  user_id: "owner",
  name: "דוד",
  phone: null,
  roles: ["owner"],
  managed_agency_ids: [],
};

/** Clients c1 (Dana, two findings) and c2 (no campaigner, one finding) of agency a1, with the owner on staff. */
function setup(): World {
  return world({
    clients: [
      { id: "c1", agency_id: "a1", name: "לקוח א" },
      { id: "c2", agency_id: "a1", name: "לקוח ב" },
    ],
    assignments: {
      c1: [
        {
          campaigner_id: "k1",
          user_id: "dana",
          name: "דנה",
          phone: "0501111111",
          campaign_role: true,
          start_date: null,
          end_date: null,
        },
      ],
    },
    staff: [owner],
    findings: [
      finding({ client_id: "c1", short_code: 1 }),
      finding({ client_id: "c1", short_code: 2, fingerprint: "fp2" }),
      finding({ client_id: "c2", short_code: 3, fingerprint: "fp3" }),
    ],
  });
}

/** routeTenant over `w` in team mode. */
const route = (w: World, dryRun = false, virtual = undefined) =>
  routeTenant(deps(w), {
    tenantId: TENANT,
    roundId: "r1",
    settings: team,
    now: w.now,
    today: "2026-11-01",
    floors: {},
    staff: () => Promise.resolve(w.staff),
    dryRun,
    virtual,
  });

/** Routes only c1's unlogged call attributed to Noa (not on c1), whose phone is `phone`. */
function routeCallBy(phone: string | null) {
  const w = setup();
  w.findings = [
    finding({
      client_id: "c1",
      kind: "contact_not_logged",
      owner_user_id: "noa",
      evidence: { attributed: true },
    }),
  ];
  w.contacts = { "user:noa": { name: "נועה", phone } };
  return route(w);
}

Deno.test("routeTenant", async (t) => {
  await t.step(
    "routes every due finding and records the decisions",
    async () => {
      const w = setup();
      const result = await route(w);
      assertEquals(result.decisions.length, 3);
      assertEquals(w.decisions.length, 3);
      assertEquals(
        w.findings.slice(0, 3).map((f) => f.escalation_level),
        [0, 0, 0],
      );
      // Nobody assigned to c2: its level 0 falls back to the owner.
      assertEquals(
        w.deliveries.map((d) => d.recipient_key),
        ["user:dana", "user:dana", "user:owner"],
      );
    },
  );

  await t.step(
    "reports the routing gaps the database did not store",
    async () => {
      const w = setup();
      w.refused = { "client:c2": "rejected_client" };
      const { result, logged } = await withConsoleErrors(() => route(w));
      assertEquals(result.gapsDropped, { rejected_client: 1 });
      assertStringIncludes(logged, '"collector":"router"');
    },
  );

  await t.step(
    "raises the routing gaps it saw and clears those checked again",
    async () => {
      const w = setup();
      const result = await route(w);
      assertEquals(
        result.gaps.map((g) => `${g.kind}:${g.fingerprint}`),
        ["no_campaigner:client:c2", "missing_phone:person:user:owner"],
      );
      assertEquals(
        w.findings.slice(3).map((f) => f.kind),
        ["no_campaigner", "missing_phone"],
      );
      assertEquals(
        w.marks.map((m) => [m.kind, m.seen, m.fingerprints, m.afterMisses]),
        [
          ["no_campaigner", ["client:c2"], ["client:c1", "client:c2"], 1],
          [
            "missing_phone",
            ["person:user:owner"],
            ["person:user:owner", "person:user:dana"],
            1,
          ],
        ],
      );
    },
  );

  await t.step(
    "a fixed gap clears on a later round with nothing else to route",
    async () => {
      const w = setup();
      await route(w);
      await route(w);
      const live = () =>
        w.findings
          .filter(
            (f) =>
              f.status !== "resolved" &&
              ["no_campaigner", "missing_phone"].includes(f.kind),
          )
          .map((f) => `${f.kind}:${f.fingerprint}`);
      assertEquals(live(), [
        "no_campaigner:client:c2",
        "missing_phone:person:user:owner",
      ]);
      w.assignments.c2 = w.assignments.c1;
      w.staff = [{ ...owner, phone: "0503333333" }];
      assertEquals((await route(w)).decisions, []);
      assertEquals(live(), []);
    },
  );

  await t.step(
    "a campaigner's phone gap is re-checked through the directory; one no longer reachable clears",
    async () => {
      const w = world({ staff: [{ ...owner, phone: "0503333333" }] });
      const gap = (key: string) =>
        finding({
          kind: "missing_phone",
          fingerprint: `person:${key}`,
          status: "notified",
          escalation_level: 2,
          routed: true,
          evidence: { recipient_key: key, role: "campaigner" },
        });
      w.findings.push(gap("user:dana"), gap("campaigner:k9"), gap("user:rina"));
      w.contacts = {
        "user:dana": { name: "דנה", phone: "0501111111" },
        "user:rina": { name: "רינה", phone: null },
      };
      const result = await route(w);
      assertEquals(
        result.gaps.map((g) => g.fingerprint),
        ["person:user:rina"],
      );
      assertEquals(
        w.findings.map((f) => f.status),
        ["resolved", "resolved", "notified"],
      );
    },
  );

  await t.step(
    "a ladder a rollout change reset starts again with the campaigner, not the manager",
    async () => {
      // Tuesday 2026-11-03 12:00 Israel time, a day after the cancelled list.
      const w = setup();
      w.now = new Date("2026-11-03T10:00:00Z");
      w.staff.push({
        user_id: "michal",
        name: "מיכל",
        phone: "0502222222",
        roles: ["team_manager"],
        managed_agency_ids: ["a1"],
      });
      const reset = finding({
        client_id: "c1",
        status: "notified",
        routed: true,
        next_action_at: "2026-11-02T18:00:00Z",
      });
      w.findings = [reset];
      w.deliveries.push(
        delivery({
          finding_id: reset.id,
          recipient_key: "user:dana",
          slot: "list",
          status: "cancelled",
          error: "rollout_changed",
        }),
      );
      await route(w);
      assertEquals(
        w.deliveries.map((d) => [d.level, d.recipient_key, d.status]),
        [[0, "user:dana", "planned"]],
      );
      assertEquals(w.deliveries[0].not_before, "2026-11-04T06:30:00.000Z");
    },
  );

  await t.step("an attributed unlogged call goes to the caller", async () => {
    const { decisions } = await routeCallBy("0504444444");
    assertEquals(
      decisions[0].deliveries.map((d) => d.recipient_key),
      ["user:noa"],
    );
  });

  await t.step("a caller without a phone is a missing_phone gap", async () => {
    const { gaps } = await routeCallBy(null);
    assertEquals(
      gaps.map((g) => g.fingerprint),
      ["person:user:owner", "person:user:noa"],
    );
  });

  await t.step("nothing to route loads nobody", async () => {
    const w = world({ failOn: "staff" });
    assertEquals((await route(w)).decisions, []);
  });

  await t.step("a dry run routes but writes nothing", async () => {
    const w = setup();
    const result = await route(w, true);
    assertEquals(
      [
        result.decisions.length,
        w.decisions.length,
        w.findings.length,
        w.marks.length,
      ],
      [3, 0, 3, 0],
    );
  });
});
