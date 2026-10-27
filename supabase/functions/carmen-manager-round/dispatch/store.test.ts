import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../tests/recording-client.ts";
import { createDeliveriesStore } from "./store.ts";

const T = "11111111-1111-4111-8111-111111111111";
const since = new Date("2026-10-31T22:00:00Z");

Deno.test("createDeliveriesStore", async (t) => {
  await t.step(
    "counts alert messages (not briefs) per person, once per message",
    async () => {
      const { db, calls } = recordingClient(() => [
        { recipient_key: "user:a", message_key: "m1" },
        { recipient_key: "user:a", message_key: "m1" },
        { recipient_key: "user:a", message_key: "m2" },
        { recipient_key: "user:b", message_key: "m3" },
      ]);
      const counts = await createDeliveriesStore(db).messagesSince(T, since);
      assertEquals(
        [...counts],
        [
          ["user:a", 2],
          ["user:b", 1],
        ],
      );
      const query = calls[0].query;
      assertEquals(
        [query.get("tenant_id"), query.get("status"), query.get("slot")],
        [`eq.${T}`, "in.(sent,delivery_unknown)", "in.(now,list)"],
      );
    },
  );

  await t.step(
    "activity counts auto-cleared findings and messages in the tenant",
    async () => {
      const { db, calls } = recordingClient(
        () => [{ recipient_key: "user:a", message_key: "m1" }],
        { count: 4 },
      );
      assertEquals(await createDeliveriesStore(db).activitySince(T, since), {
        autoCleared: 4,
        messages: 1,
      });
      assertEquals(
        [
          calls[0].method,
          calls[0].query.get("tenant_id"),
          calls[0].query.get("details->>resolution"),
        ],
        ["HEAD", `eq.${T}`, "eq.auto_cleared"],
      );
    },
  );

  await t.step("outcomes go to the record RPCs with the tenant", async () => {
    const { db, calls } = recordingClient(() => 1);
    const store = createDeliveriesStore(db);
    await store.recordSend(T, ["d1"], {
      status: "planned",
      notBefore: new Date("2026-11-02T06:30:00Z"),
    });
    await store.recordBrief(
      T,
      ["f1"],
      {
        key: "user:o",
        user_id: "o",
        name: "דוד",
        phone: "972503333333",
        role: "owner",
      },
      { status: "sent", messageKey: "m1", providerMessageId: "w1" },
    );
    assertEquals(calls[0].body, {
      p_tenant_id: T,
      p_delivery_ids: ["d1"],
      p_status: "planned",
      p_not_before: "2026-11-02T06:30:00.000Z",
    });
    assertEquals(calls[1].body, {
      p_tenant_id: T,
      p_finding_ids: ["f1"],
      p_status: "sent",
      p_message_key: "m1",
      p_provider_message_id: "w1",
      p_recipient: {
        recipient_key: "user:o",
        recipient_user_id: "o",
        recipient_name: "דוד",
        recipient_phone: "972503333333",
      },
    });
  });
});
