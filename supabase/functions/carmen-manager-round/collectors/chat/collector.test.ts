import { assert, assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { latestSlot } from "../../calendar/slots.ts";
import { dmRow, il, row, staffRow } from "../../tests/chat-fixtures.ts";
import { chatContext, fakeChatSources } from "../../tests/fake-chat-sources.ts";
import { modelAnswer } from "../../tests/fake-classify.ts";
import type { CollectorContext } from "../types.ts";
import { chatCollector, createChatCollector } from "./collector.ts";
import type { ChatSources } from "./sources.ts";

const collect = (fake: ChatSources, fields: Partial<CollectorContext> = {}) =>
  createChatCollector(() => fake).collect(chatContext(fields));

const kindsOff = (...kinds: string[]) =>
  resolveManagerSettings({
    manager: {
      kinds: Object.fromEntries(kinds.map((k) => [k, { enabled: false }])),
    },
  });

const late = [
  staffRow({ message_id: "hi", created_at: il("08:00") }),
  row({
    message_id: "g1",
    created_at: il("09:00"),
    message_text: "אפשר להעלות את המבצע?",
  }),
  dmRow({
    message_id: "d1",
    created_at: il("13:30"),
    message_text: "אני לא מרוצה",
  }),
];

Deno.test("chat collector", async (t) => {
  await t.step(
    "runs every 3 hours from 08 to 20 Israel time, Sunday to Friday",
    () => {
      const { schedule } = chatCollector;
      assert("cron" in schedule);
      const slotAt = (time: string, day = "2026-10-27") =>
        latestSlot(schedule.cron, new Date(il(time, day)), 1)?.toISOString();
      for (const time of ["08:00", "11:00", "14:00", "17:00", "20:00"]) {
        assertEquals(slotAt(time), il(time), time);
      }
      for (const time of ["09:00", "10:00", "12:00", "21:00", "23:00"]) {
        assertEquals(slotAt(time), undefined, time);
      }
      assertEquals(slotAt("08:00", "2026-10-31"), undefined, "Saturday");
    },
  );

  await t.step(
    "raises the late request, the complaint and the unlinked group",
    async () => {
      const { fake, asked } = fakeChatSources(late);
      const result = await collect(fake);
      assertEquals(
        result.candidates.map((c) => [c.kind, c.fingerprint]),
        [
          ["unanswered_request", "chat:group:111@g.us:g1"],
          ["client_complaint", "chat:dm:owner:501234567:complaint:d1"],
          ["unlinked_group", "group:999@g.us"],
        ],
      );
      assertEquals(
        asked.length,
        1,
        "only the group thread may go to the model",
      );
      assertEquals(result.watermark, { read_lines: ["owner"] });
      assertEquals(result.coverage, {
        complete: true,
        clientIds: null,
        kinds: ["unanswered_request", "client_complaint", "unlinked_group"],
      });
      assert(!JSON.stringify(result.candidates).includes("לא מרוצה"));
    },
  );

  await t.step(
    "a client's unanswered direct message is raised by the markers, unquoted",
    async () => {
      const ask = "אפשר לקבל את הדוח?";
      const dm = [dmRow({ message_id: "q1", message_text: ask })];
      const { fake, asked } = fakeChatSources(dm, { answer: modelAnswer() });
      const [found] = (await collect(fake)).candidates;
      assertEquals(
        [found.kind, found.fingerprint, found.evidence.classified_by],
        ["unanswered_request", "chat:dm:owner:501234567:q1", "markers"],
      );
      assertEquals(asked.length, 0, "direct-chat text never goes to the model");
      assert(!JSON.stringify(found).includes(ask));
    },
  );

  await t.step(
    "a tenant's unanswered_reply_hours of 6 holds back a 5-hour wait",
    async () => {
      const { fake } = fakeChatSources(late);
      const result = await collect(fake, {
        settings: resolveManagerSettings({ unanswered_reply_hours: 6 }),
      });
      assertEquals(
        result.candidates.map((c) => c.kind),
        ["client_complaint", "unlinked_group"],
      );
    },
  );

  await t.step(
    "all chat kinds off: no read, no model, nothing cleared",
    async () => {
      const { fake, asked, reads } = fakeChatSources(late);
      const result = await collect(fake, {
        settings: kindsOff(
          "unanswered_request",
          "client_complaint",
          "unlinked_group",
        ),
      });
      assertEquals([result.candidates, asked.length, reads], [[], 0, []]);
      assertEquals(
        [result.coverage.complete, result.note],
        [false, "kinds_off"],
      );
    },
  );

  await t.step(
    "requests and complaints off: no thread read and no model call",
    async () => {
      const { fake, asked, reads } = fakeChatSources(late);
      const result = await collect(fake, {
        settings: kindsOff("unanswered_request", "client_complaint"),
      });
      assertEquals(
        result.candidates.map((c) => c.kind),
        ["unlinked_group"],
      );
      assertEquals([asked.length, reads], [0, ["lines", "unlinked"]]);
      assertEquals(result.watermark, { read_lines: [] });
    },
  );

  await t.step(
    "unlinked groups off: the group names are not read",
    async () => {
      const { fake, reads } = fakeChatSources(late);
      const result = await collect(fake, {
        settings: kindsOff("unlinked_group"),
      });
      assert(!reads.includes("unlinked"));
      assertEquals(result.coverage.kinds, [
        "unanswered_request",
        "client_complaint",
      ]);
    },
  );

  await t.step(
    "says why a run found less than it could: model down, answers dropped, read capped",
    async () => {
      const down = await collect(fakeChatSources(late).fake);
      assertEquals(down.note, "model_unavailable");
      const broken = await collect(
        fakeChatSources(late, { answer: "{oops" }).fake,
      );
      assertEquals(broken.note, "verdict_rejected:1");
      const capped = await collect(
        fakeChatSources(late, { capped: true, answer: "{oops" }).fake,
      );
      assertEquals(
        [capped.note, capped.coverage.complete],
        ["read_capped,verdict_rejected:1", false],
      );
    },
  );

  await t.step(
    "a call read stopped at its page cap makes the run incomplete",
    async () => {
      const capped = await collect(
        fakeChatSources(late, { callsCapped: true, answer: modelAnswer() })
          .fake,
      );
      assertEquals(
        [capped.note, capped.coverage.complete],
        ["read_capped", false],
        "a dropped call may have answered a wait, so nothing is auto-cleared",
      );
    },
  );

  await t.step("a preview never asks the model", async () => {
    const { fake, asked } = fakeChatSources(late);
    await collect(fake, { dryRun: true });
    assertEquals(asked.length, 0);
  });

  await t.step(
    "no monitored line clears nothing and says why; a client run skips unlinked groups",
    async () => {
      const none = await collect(fakeChatSources([], { lines: [] }).fake);
      assertEquals(
        [none.candidates, none.coverage.complete, none.note],
        [[], false, "no_monitored_line"],
      );
      const one = await collect(fakeChatSources([]).fake, {
        clientIds: ["c1"],
      });
      assertEquals([one.candidates, one.coverage.clientIds], [[], ["c1"]]);
    },
  );
});
