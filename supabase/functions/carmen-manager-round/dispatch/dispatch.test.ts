import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../budget.ts";
import { deps } from "../tests/fakes.ts";
import {
  delivery,
  finding,
  TENANT,
  type World,
  world,
} from "../tests/fake-world.ts";
import { dispatchDue } from "./dispatch.ts";

const team = resolveManagerSettings({
  manager: { mode: "team", notify_since: "2026-10-01T00:00:00Z" },
});

/** Adds `count` notified findings, each with one due row for the default recipient. */
function setup(
  w: World,
  count: number,
  fields: Parameters<typeof finding>[0] = {},
) {
  for (let i = 0; i < count; i++) {
    const f = finding({
      short_code: 10 + i,
      summary_he: `ממצא ${i}`,
      status: "notified",
      ...fields,
    });
    w.findings.push(f);
    w.deliveries.push(delivery({ finding_id: f.id }));
  }
}

/** dispatchDue over `w` in team mode unless `settings` says otherwise; `fields` override the run. */
const run = (
  w: World,
  skip: string[] = [],
  settings = team,
  fields: {
    briefKeys?: string[];
    budget?: RoundBudget;
    ports?: ReturnType<typeof deps>;
    settingsChanged?: () => Promise<boolean>;
  } = {},
) =>
  dispatchDue(fields.ports ?? deps(w), {
    tenantId: TENANT,
    settings,
    now: w.now,
    skip: new Set(skip),
    floors: {},
    briefKeys: () => Promise.resolve(new Set(fields.briefKeys ?? [])),
    budget: fields.budget ?? RoundBudget.create(140_000, 0),
    settingsChanged: fields.settingsChanged ?? (() => Promise.resolve(false)),
  });

Deno.test("dispatchDue", async (t) => {
  await t.step(
    "one message per person with every due item, outcome on each row",
    async () => {
      const w = world();
      setup(w, 2);
      w.deliveries.push(
        delivery({
          finding_id: w.findings[0].id,
          recipient_key: "user:avi",
          recipient_name: "אבי",
          recipient_phone: "972502222222",
          level: 1,
        }),
      );
      const report = await run(w);
      assertEquals([report.messages, report.sent], [2, 2]);
      assertEquals(
        w.sent[0].message,
        "היי דנה, יש 2 דברים שדורשים טיפול:\n1) #10 ממצא 0\n2) #11 ממצא 1",
      );
      assertEquals(
        w.sent[1].message.includes("(עבר אליך כי לא טופל בזמן)"),
        true,
      );
      const dana = w.deliveries.filter((d) => d.recipient_key === "user:u");
      assertEquals(
        dana.map((d) => d.status),
        ["sent", "sent"],
      );
      assertEquals(new Set(dana.map((d) => d.message_key)).size, 1);
    },
  );

  await t.step("on Shabbat only a Shabbat-critical alert leaves", async () => {
    const w = world({ now: new Date("2026-10-31T09:00:00Z") });
    setup(w, 1);
    setup(w, 1, {
      kind: "platform_alert",
      severity: "critical",
      evidence: { alert_type: "ad_account_disabled" },
    });
    await run(w);
    assertEquals(w.sent.length, 1);
    assertEquals(w.sent[0].message.includes("(דחוף)"), true);
    const held = w.deliveries.find((d) => d.status === "planned");
    assertEquals(held?.not_before, "2026-11-01T07:00:00.000Z");
  });

  await t.step(
    "closed findings and kinds that stopped sending are cancelled",
    async () => {
      const w = world();
      setup(w, 1, { kind: "cost_spike" });
      w.deliveries.push(delivery({ finding_id: "gone" }));
      const observeCost = resolveManagerSettings({
        manager: { mode: "team", kinds: { cost_spike: { mode: "observe" } } },
      });
      const report = await run(w, [], observeCost);
      assertEquals([w.sent.length, report.cancelled], [0, 2]);
    },
  );

  await t.step(
    "team -> david_only: rows planned for campaigners are cancelled, the brief recipients' go",
    async () => {
      const w = world();
      setup(w, 1);
      w.deliveries.push(
        delivery({
          finding_id: w.findings[0].id,
          recipient_key: "user:owner",
          recipient_name: "דוד",
          level: 2,
        }),
      );
      const davidOnly = resolveManagerSettings({
        manager: { mode: "david_only", notify_since: "2026-10-01T00:00:00Z" },
      });
      const report = await run(w, [], davidOnly, { briefKeys: ["user:owner"] });
      assertEquals([report.sent, report.cancelled], [1, 1]);
      assertEquals(w.sent[0].message.startsWith("היי דוד"), true);
    },
  );

  await t.step(
    "david_only -> observe -> david_only: rows about events before the new notify_since are cancelled",
    async () => {
      const w = world();
      setup(w, 1, { source_event_at: "2026-11-01T05:00:00Z" });
      w.deliveries[0].recipient_key = "user:owner";
      const restamped = resolveManagerSettings({
        manager: { mode: "david_only", notify_since: "2026-11-01T07:30:00Z" },
      });
      const report = await run(w, [], restamped, { briefKeys: ["user:owner"] });
      assertEquals([w.sent.length, report.cancelled], [0, 1]);
      assertEquals(w.deliveries[0].status, "cancelled");
    },
  );

  await t.step(
    "someone who got the brief this round waits; no phone and failures are recorded",
    async () => {
      const w = world();
      setup(w, 1);
      await run(w, ["user:u"]);
      assertEquals([w.sent.length, w.deliveries[0].status], [0, "planned"]);

      const phoneless = world();
      setup(phoneless, 1);
      phoneless.deliveries[0].recipient_phone = null;
      await run(phoneless);
      assertEquals(
        [phoneless.sent.length, phoneless.deliveries[0].status],
        [0, "no_phone"],
      );

      const down = world({ sendStatus: "no_line" });
      setup(down, 1);
      await run(down);
      assertEquals(down.deliveries[0].status, "no_line");
    },
  );

  await t.step("without time for a send nothing is claimed", async () => {
    const w = world();
    setup(w, 1);
    const report = await run(w, [], team, {
      budget: RoundBudget.create(60_000, 0),
    });
    assertEquals([report.messages, w.deliveries[0].status], [0, "planned"]);
  });

  await t.step(
    "out of time mid-way, the rest of the claim is put back due at once",
    async () => {
      const w = world();
      setup(w, 1);
      setup(w, 1, { short_code: 20 });
      w.deliveries[1].recipient_key = "user:avi";
      let clock = 0;
      const ports = deps(w);
      const send = ports.send;
      ports.send = (input) => {
        clock += 80_000;
        return send(input);
      };
      const report = await run(w, [], team, {
        ports,
        budget: RoundBudget.create(140_000, 0, () => clock),
      });
      assertEquals([report.messages, report.deferred], [1, 1]);
      assertEquals(
        w.deliveries.map((d) => [d.status, d.not_before]),
        [
          ["sent", "2026-10-01T00:00:00Z"],
          ["planned", w.now.toISOString()],
        ],
      );
    },
  );

  await t.step(
    "a switch just before a message leaves stops it and the rest of the claim",
    async () => {
      const w = world();
      setup(w, 1);
      setup(w, 1, { short_code: 20 });
      w.deliveries[1].recipient_key = "user:avi";
      // The check before the first person passes; the owner switches while
      // that person's rows are recorded, before the message leaves.
      let checks = 0;
      const report = await run(w, [], team, {
        settingsChanged: () => Promise.resolve(++checks > 1),
      });
      assertEquals(w.sent, []);
      assertEquals([report.messages, report.deferred], [0, 2]);
      assertEquals(
        w.deliveries.map((d) => [d.status, d.not_before, d.attempted_at]),
        [
          ["planned", w.now.toISOString(), null],
          ["planned", w.now.toISOString(), null],
        ],
      );
    },
  );
});
