import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
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

const run = (w: World, skip: string[] = [], settings = team) =>
  dispatchDue(deps(w), {
    tenantId: TENANT,
    settings,
    now: w.now,
    skip: new Set(skip),
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

  await t.step(
    "at most seven items; the rest roll to the next 08:30 list",
    async () => {
      const w = world();
      setup(w, 9);
      await run(w);
      assertEquals(w.sent.length, 1);
      assertEquals(w.sent[0].message.split("\n").length, 8);
      const later = w.deliveries.filter((d) => d.status === "planned");
      assertEquals(
        later.map((d) => d.not_before),
        ["2026-11-02T06:30:00.000Z", "2026-11-02T06:30:00.000Z"],
      );
    },
  );

  await t.step("over the daily cap nothing is sent today", async () => {
    const w = world();
    setup(w, 1);
    for (let i = 0; i < 8; i++) {
      w.deliveries.push(
        delivery({
          finding_id: "old",
          status: "sent",
          attempted_at: "2026-11-01T06:00:00Z",
        }),
      );
    }
    const report = await run(w);
    assertEquals([w.sent.length, report.deferred], [0, 1]);
  });

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
});
