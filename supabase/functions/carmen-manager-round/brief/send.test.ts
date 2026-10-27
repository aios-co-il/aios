import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../budget.ts";
import type { Recipient } from "../findings/types.ts";
import { deps } from "../tests/fakes.ts";
import { finding, TENANT, type World, world } from "../tests/fake-world.ts";
import { briefed, sendBriefIfDue } from "./send.ts";

const david: Recipient = {
  key: "user:david",
  user_id: "david",
  name: "דוד",
  phone: "972503333333",
  role: "owner",
};
const SINCE = "2026-10-01T00:00:00Z";
// Sunday 08:07 Israel time.
const SLOT_TIME = new Date("2026-11-01T06:07:00Z");

function brief(
  w: World,
  manager: Record<string, unknown>,
  fields: {
    dryRun?: boolean;
    recipients?: Recipient[];
    budget?: RoundBudget;
    ports?: ReturnType<typeof deps>;
    settingsChanged?: boolean;
  } = {},
) {
  return sendBriefIfDue(fields.ports ?? deps(w), {
    tenantId: TENANT,
    settings: resolveManagerSettings({ manager }),
    now: w.now,
    recipients: () => Promise.resolve(fields.recipients ?? [david]),
    floors: {},
    budget: fields.budget ?? RoundBudget.create(140_000, 0),
    settingsChanged: () => Promise.resolve(fields.settingsChanged ?? false),
    dryRun: fields.dryRun ?? false,
  });
}

Deno.test("sendBriefIfDue", async (t) => {
  await t.step(
    "only in the 08:00 slot, once, and not on a holiday",
    async () => {
      const team = { mode: "team", notify_since: SINCE };
      assertEquals(
        await brief(world({ now: new Date("2026-11-01T09:00:00Z") }), team),
        null,
      );
      const w = world({ now: SLOT_TIME });
      assertEquals((await brief(w, team))?.sent, [
        { key: "user:david", status: "sent" },
      ]);
      assertEquals(await brief(w, team), null);
      assertEquals(w.sent.length, 1);
      assertEquals(
        await brief(world({ now: SLOT_TIME }), {
          ...team,
          holidays: ["2026-11-01"],
        }),
        null,
      );
    },
  );

  await t.step(
    "lists owner-level and critical items it may tell about, and records them",
    async () => {
      const w = world({ now: SLOT_TIME });
      const atOwner = finding({
        short_code: 5,
        summary_he: "ברמת בעלים",
        escalation_level: 2,
        status: "notified",
      });
      w.findings.push(
        atOwner,
        finding({
          short_code: 6,
          summary_he: "רק בקמפיינר",
          escalation_level: 0,
          status: "notified",
        }),
        finding({
          short_code: 7,
          summary_he: "קריטי ישן",
          severity: "critical",
          source_event_at: "2026-09-01T00:00:00Z",
        }),
        finding({
          short_code: 8,
          summary_he: "אושר",
          escalation_level: 2,
          status: "acknowledged",
        }),
      );
      await brief(w, { mode: "team", notify_since: SINCE });
      assertEquals(w.sent[0].message.includes("1) #5 ברמת בעלים"), true);
      assertEquals(/#6|#7|#8/.test(w.sent[0].message), false);
      assertEquals(
        w.deliveries.map((d) => [d.finding_id, d.slot, d.status]),
        [[atOwner.id, "brief", "sent"]],
      );
    },
  );

  await t.step(
    "a dry run previews outside the slot and claims nothing",
    async () => {
      const w = world({ now: new Date("2026-11-01T12:00:00Z") });
      const report = await brief(
        w,
        { mode: "david_only", notify_since: SINCE },
        { dryRun: true },
      );
      assertEquals(report?.sent[0].status, "preview");
      assertEquals(report?.sent[0].text?.startsWith("בוקר טוב דוד"), true);
      assertEquals([w.sent.length, w.slots.length], [0, 0]);
    },
  );

  await t.step(
    "a recipient without a phone is recorded, not messaged",
    async () => {
      const w = world({ now: SLOT_TIME });
      const report = await brief(
        w,
        { mode: "david_only", notify_since: SINCE },
        { recipients: [{ ...david, phone: null }] },
      );
      assertEquals([report?.sent[0].status, w.sent.length], ["no_phone", 0]);
    },
  );

  await t.step(
    "a recipient the call had no time for gets the brief on the next call",
    async () => {
      const w = world({ now: SLOT_TIME });
      const dana = { ...david, key: "user:dana", name: "דנה" };
      let clock = 0;
      const ports = deps(w);
      const send = ports.send;
      ports.send = (input) => {
        clock += 80_000;
        return send(input);
      };
      const manager = { mode: "david_only", notify_since: SINCE };
      const recipients = [david, dana];
      const first = await brief(w, manager, {
        recipients,
        ports,
        budget: RoundBudget.create(140_000, 0, () => clock),
      });
      assertEquals([first?.sent.length, first?.deferred], [1, 1]);
      const next = await brief(w, manager, { recipients });
      assertEquals(next?.sent, [{ key: "user:dana", status: "sent" }]);
      assertEquals(w.sent.length, 2);
    },
  );

  await t.step(
    "after the owner changed the settings mid-run nothing is claimed or sent",
    async () => {
      const w = world({ now: SLOT_TIME });
      const report = await brief(
        w,
        { mode: "david_only", notify_since: SINCE },
        { settingsChanged: true },
      );
      assertEquals([report?.sent, report?.deferred], [[], 1]);
      assertEquals([w.sent.length, w.slots.length], [0, 0]);
    },
  );

  await t.step("only a delivered brief counts as this round's message", () => {
    assertEquals(
      [
        ...briefed({
          slot: "",
          deferred: 0,
          sent: [
            { key: "a", status: "sent" },
            { key: "b", status: "no_phone" },
            { key: "c", status: "delivery_unknown" },
          ],
        }),
      ],
      ["a", "c"],
    );
  });
});
