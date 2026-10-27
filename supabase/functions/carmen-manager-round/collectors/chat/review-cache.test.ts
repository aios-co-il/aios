import { assertEquals } from "jsr:@std/assert@1";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { createReviewCache } from "./review-cache.ts";
import type { ChatVerdict } from "./verdict.ts";

const verdict: ChatVerdict = {
  needs_reply: false,
  is_request: false,
  complaint_ids: ["m1"],
  urgency: "high",
  summary_he: "הלקוח לא מרוצה מהלידים",
  confidence: 0.7,
};

Deno.test("createReviewCache", async (t) => {
  await t.step("loads valid verdicts of the tenant's threads", async () => {
    const { db, calls } = recordingClient(() => [
      { thread_key: "group:a", last_reviewed_message_id: "m1", verdict },
      { thread_key: "group:b", last_reviewed_message_id: "m2", verdict: {} },
    ]);
    const cached = await createReviewCache(db, TENANT).load([
      "group:a",
      "group:b",
    ]);
    assertEquals(
      [...cached.entries()],
      [["group:a", { messageId: "m1", verdict }]],
    );
    assertEquals(calls[0].query.get("tenant_id"), `eq.${TENANT}`);
  });

  await t.step("saves one row per tenant thread (upsert)", async () => {
    const { db, calls } = recordingClient(() => []);
    await createReviewCache(db, TENANT).save("group:a", {
      messageId: "m3",
      verdict,
      costUsd: 0.001,
    });
    assertEquals(calls[0].method, "POST");
    assertEquals(calls[0].query.get("on_conflict"), "tenant_id,thread_key");
    const body = calls[0].body;
    const saved = Array.isArray(body) ? body[0] : body;
    assertEquals(
      [
        saved.tenant_id,
        saved.thread_key,
        saved.last_reviewed_message_id,
        saved.verdict,
      ],
      [TENANT, "group:a", "m3", verdict],
    );
  });

  await t.step("nothing to load, no query", async () => {
    const { db, calls } = recordingClient();
    assertEquals((await createReviewCache(db, TENANT).load([])).size, 0);
    assertEquals(calls.length, 0);
  });
});
