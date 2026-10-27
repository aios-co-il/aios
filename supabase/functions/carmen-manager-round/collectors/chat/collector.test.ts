import { assert, assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../../budget.ts";
import {
  dmRow,
  il,
  NOW,
  row,
  SETTINGS,
  STAFF_KEY,
} from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import type { CollectorContext } from "../types.ts";
import type { ActivityRow } from "./activity.ts";
import { createChatCollector, readSince } from "./collector.ts";
import type { LiveChatFinding } from "./gate.ts";
import { createLlmMeter } from "./llm-meter.ts";
import type { ChatSources } from "./sources.ts";

function context(fields: Partial<CollectorContext> = {}): CollectorContext {
  return {
    tenantId: TENANT,
    settings: SETTINGS,
    now: NOW,
    since: NOW,
    watermark: null,
    budget: RoundBudget.create(60_000, 10),
    clientIds: null,
    db: recordingClient().db,
    fixtures: null,
    dryRun: false,
    ...fields,
  };
}

function sources(
  rows: ActivityRow[],
  fields: { connections?: string[]; live?: LiveChatFinding[] } = {},
) {
  const asked: string[] = [];
  const fake: ChatSources = {
    connectionIds: () => Promise.resolve(fields.connections ?? ["owner"]),
    activity: () => Promise.resolve(rows),
    unlinked: () =>
      Promise.resolve([
        {
          group_id: "g9",
          group_chat_id: "999@g.us",
          group_name: "Acme שיווק",
          client_id: "c9",
          client_name: "Acme",
          message_count: 6,
          last_message_at: il("10:00"),
        },
      ]),
    staffKeys: () => Promise.resolve(new Set([STAFF_KEY])),
    calls: () => Promise.resolve([]),
    live: () => Promise.resolve(fields.live ?? []),
    chatLinkBase: () => Promise.resolve("https://app.test/t/acme/chat/"),
    classify: {
      cache: {
        load: () => Promise.resolve(new Map()),
        save: () => Promise.resolve(),
      },
      ask: (prompt) => {
        asked.push(prompt);
        return Promise.resolve({ text: null, costUsd: 0 });
      },
      meter: () =>
        Promise.resolve(
          createLlmMeter({
            monthBudgetUsd: null,
            monthSpentUsd: 0,
            dailyCapUsd: 1,
            daySpentUsd: 0,
          }),
        ),
    },
  };
  return { fake, asked };
}

Deno.test("chat collector", async (t) => {
  await t.step(
    "raises the late request, the complaint and the unlinked group",
    async () => {
      const { fake, asked } = sources([
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
      ]);
      const result = await createChatCollector(() => fake).collect(context());
      assertEquals(
        result.candidates.map((c) => [c.kind, c.fingerprint]),
        [
          ["unanswered_request", "chat:group:111@g.us:g1"],
          ["client_complaint", "chat:dm:owner:501234567:d1"],
          ["unlinked_group", "group:999@g.us"],
        ],
      );
      assertEquals(
        asked.length,
        1,
        "only the group thread may go to the model",
      );
      assertEquals(result.coverage, { complete: true, clientIds: null });
      assert(!JSON.stringify(result.candidates).includes("לא מרוצה"));
    },
  );

  await t.step("closes an open wait that staff answered", async () => {
    const { fake } = sources(
      [
        row({ message_id: "g1", created_at: il("09:00") }),
        row({
          message_id: "s1",
          sender_match_key: STAFF_KEY,
          created_at: il("10:00"),
        }),
      ],
      {
        live: [
          {
            kind: "unanswered_request",
            fingerprint: "chat:group:111@g.us:g1",
            firstPendingAt: il("09:00"),
          },
        ],
      },
    );
    const result = await createChatCollector(() => fake).collect(context());
    assertEquals(
      result.resolved?.map((r) => [r.fingerprint, r.details.response_minutes]),
      [["chat:group:111@g.us:g1", 60]],
    );
  });

  await t.step(
    "no monitored line clears nothing; a client run skips unlinked groups",
    async () => {
      const none = await createChatCollector(
        () => sources([], { connections: [] }).fake,
      ).collect(context());
      assertEquals([none.candidates, none.coverage.complete], [[], false]);
      const one = await createChatCollector(() => sources([]).fake).collect(
        context({ clientIds: ["c1"] }),
      );
      assertEquals(
        [one.candidates, one.coverage],
        [[], { complete: true, clientIds: ["c1"] }],
      );
    },
  );
});

Deno.test("readSince", async (t) => {
  await t.step("7 days back, or the earliest notify_since after that", () => {
    assertEquals(
      readSince({ settings: SETTINGS, now: NOW }),
      new Date("2026-10-20T12:00:00Z"),
    );
    const sending = resolveManagerSettings({
      manager: {
        mode: "david_only",
        notify_since: "2026-10-26T06:00:00Z",
        kinds: { unlinked_group: { mode: "observe" } },
      },
    });
    assertEquals(
      readSince({ settings: sending, now: NOW }),
      new Date("2026-10-26T06:00:00Z"),
    );
  });
});
