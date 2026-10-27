import { assert, assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { dmRow, il, row, staffRow } from "../../tests/chat-fixtures.ts";
import { chatContext, fakeChatSources } from "../../tests/fake-chat-sources.ts";
import type { CollectorContext } from "../types.ts";
import { createChatCollector } from "./collector.ts";
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
