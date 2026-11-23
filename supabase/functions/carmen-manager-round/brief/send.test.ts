import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "../budget.ts";
import { deps } from "../tests/fakes.ts";
import { finding, world } from "../tests/fake-world.ts";
import { briefed } from "./send.ts";
import { brief, david, SINCE, SLOT_TIME } from "./send.test-fixture.ts";

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
    "a slot the run's state shows as claimed is skipped without reading the brief",
    async () => {
      const w = world({
        now: SLOT_TIME,
        state: [
          {
            collector: "brief:user:david",
            first_run_at: SINCE,
            last_run_at: null,
            last_slot: "2026-11-01T06:00:00Z",
            watermark: null,
          },
        ],
      });
      const ports = deps(w);
      let reads = 0;
      ports.findings = {
        ...ports.findings,
        listLive: () => {
          reads += 1;
          return Promise.reject(new Error("db down"));
        },
      };
      const team = { mode: "team", notify_since: SINCE };
      assertEquals(await brief(w, team, { ports }), null);
      assertEquals([reads, w.sent.length, w.slots.length], [0, 0, 0]);
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
    "card drafts are one counted line with the page link, never recorded as listed",
    async () => {
      const w = world({ now: SLOT_TIME });
      const level = { escalation_level: 2, status: "notified" };
      const atOwner = finding({
        ...level,
        short_code: 5,
        summary_he: "ברמת בעלים",
      });
      w.findings.push(
        atOwner,
        ...[11, 12].map((short_code) =>
          finding({ ...level, short_code, kind: "card_stale_group" }),
        ),
      );
      const ports = deps(w);
      const link = "https://aios.test/t/acme/card-drafts";
      ports.cardDraftsLink = () => Promise.resolve(link);

      await brief(w, { mode: "david_only", notify_since: SINCE }, { ports });

      // The world's activity lines follow; this step checks the decisions and drafts lines.
      assertEquals(w.sent[0].message.split("\n").slice(1, 4), [
        "דורש החלטה שלך:",
        "1) #5 ברמת בעלים",
        `📝 2 עדכונים לכרטיסי לקוחות מחכים לאישור: ${link}`,
      ]);
      assertEquals(
        w.deliveries.map((d) => d.finding_id),
        [atOwner.id],
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
        { settingsChanged: () => true },
      );
      assertEquals([report?.sent, report?.deferred], [[], 1]);
      assertEquals([w.sent.length, w.slots.length], [0, 0]);
    },
  );

  await t.step(
    "a switch while the brief is gathered: nothing is claimed or sent",
    async () => {
      const w = world({ now: SLOT_TIME });
      const ports = deps(w);
      let changed = false;
      const listLive = ports.findings.listLive;
      ports.findings = {
        ...ports.findings,
        listLive: (...args) => {
          changed = true;
          return listLive(...args);
        },
      };
      const report = await brief(
        w,
        { mode: "david_only", notify_since: SINCE },
        { ports, settingsChanged: () => changed },
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
