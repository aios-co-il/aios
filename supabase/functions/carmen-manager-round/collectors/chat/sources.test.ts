import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "../../budget.ts";
import { NOW, SETTINGS } from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import type { CollectorContext } from "../types.ts";
import { dbChatSources } from "./sources.ts";

function context(db: CollectorContext["db"]): CollectorContext {
  return {
    tenantId: TENANT,
    settings: SETTINGS,
    now: NOW,
    since: NOW,
    watermark: null,
    budget: RoundBudget.create(60_000, 10),
    clientIds: null,
    db,
    fixtures: null,
    dryRun: false,
  };
}

Deno.test("dbChatSources", async (t) => {
  await t.step("links into the tenant's own Chat page", async () => {
    const { db, calls } = recordingClient(() => ({ slug: "דיגיטל" }));
    const sources = dbChatSources(context(db), "chat_sla", "https://app.test/");
    assertEquals(
      await sources.chatLinkBase(),
      `https://app.test/t/${encodeURIComponent("דיגיטל")}/chat/`,
    );
    assertEquals(calls[0].query.get("id"), `eq.${TENANT}`);
  });

  await t.step("no app URL, no link and no read", async () => {
    const { db, calls } = recordingClient(() => ({ slug: "acme" }));
    const sources = dbChatSources(context(db), "chat_sla", null);
    assertEquals([await sources.chatLinkBase(), calls.length], [null, 0]);
  });
});
