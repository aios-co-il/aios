import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb } from "../fake-db.ts";
import { executeSendTemplateToList } from "./send-to-list.ts";

const T = "tenant-1";
const tables = {
  message_templates: [
    {
      id: "tpl",
      tenant_id: T,
      name: "Hello",
      channel: "email",
      subject: "S",
      body_text: "T",
      body_html: "<p>H</p>",
      html_mode: false,
      attachments: [],
      media_url: null,
      archived_at: null,
    },
  ],
  broadcast_lists: [
    { id: "list", tenant_id: T, name: "VIP", kind: "static", source: "manual" },
  ],
};
const config = { template_id: "tpl", list_id: "list" };

function setup(
  reserved: boolean,
  enqueue: (id: string) => Promise<{ total: number }>,
) {
  const fake = fakeDb(tables, {
    broadcast_reserve_automation_send: () => [{ reserved, broadcast_id: "b1" }],
  });
  const enqueued: string[] = [];
  const ctx = {
    automationId: "auto",
    resolveOwnerId: async () => "owner",
    resolveEmailFrom: async () => ({ fromEmail: "a@x.co", fromName: null }),
    enqueue: (id: string) => {
      enqueued.push(id);
      return enqueue(id);
    },
  };
  const run = (data: Record<string, unknown> = {}) =>
    executeSendTemplateToList(fake.db, config, data, T, ctx);
  return { ...fake, enqueued, run };
}

const statusUpdates = (writes: { table: string; values: unknown }[]) =>
  writes
    .filter((w) => w.table === "broadcasts")
    .map((w) =>
      w.values && typeof w.values === "object" && "status" in w.values
        ? w.values.status
        : null,
    );

Deno.test("a test run skips without touching the database", async () => {
  const s = setup(true, async () => ({ total: 3 }));
  assertEquals(await s.run({ test: true }), {
    success: true,
    skipped: "test_run",
  });
  assertEquals(s.rpcCalls, []);
  assertEquals(s.writes, []);
  assertEquals(s.enqueued, []);
});

Deno.test("an unreserved send is skipped as sent_recently", async () => {
  const s = setup(false, async () => ({ total: 3 }));
  const res = await s.run();
  assertStrictEquals(res.skipped, "sent_recently");
  assertEquals(s.enqueued, []);
  assertEquals(s.writes, []);
});

Deno.test("a reserved send with recipients starts sending", async () => {
  const s = setup(true, async () => ({ total: 3 }));
  const res = await s.run();
  assertEquals(res, { success: true, broadcast_id: "b1", recipients: 3 });
  assertEquals(s.enqueued, ["b1"]);
  assertEquals(statusUpdates(s.writes), ["draft", "sending"]);
});

Deno.test("a send with no valid recipients is canceled", async () => {
  const s = setup(true, async () => ({ total: 0 }));
  await s.run();
  assertEquals(statusUpdates(s.writes), ["draft", "canceled"]);
});

Deno.test(
  "an enqueue failure marks the broadcast failed and rethrows",
  async () => {
    const s = setup(true, async () => {
      throw new Error("boom");
    });
    await assertRejects(() => s.run(), Error, "boom");
    assertEquals(statusUpdates(s.writes), ["draft", "failed"]);
    const failed = s.writes.at(-1);
    assertEquals(failed?.values, { status: "failed", last_error: "boom" });
  },
);
