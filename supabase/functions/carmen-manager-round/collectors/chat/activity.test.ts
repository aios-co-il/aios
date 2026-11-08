import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { NOW, row } from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadThreadActivity, loadUnlinkedGroups } from "./activity.ts";

const query = {
  tenantId: TENANT,
  connectionIds: ["owner"],
  carmenConnectionIds: [],
  since: NOW,
  clientIds: null,
};

/** The provider a request body names. */
const providerOf = (body: unknown) =>
  body && typeof body === "object" && "p_provider" in body
    ? body.p_provider
    : undefined;

/** `count` rows of thread `key`. */
const rows = (key: string, count: number) =>
  Array.from({ length: count }, () => row({ thread_key: key }));

/** The keyset cursor a request body carries, if any. */
const afterKey = (body: unknown) =>
  body && typeof body === "object" && "p_after_thread_key" in body
    ? body.p_after_thread_key
    : undefined;

Deno.test("loadThreadActivity", async (t) => {
  await t.step(
    "adds Carmen's groups no Green line read, without her own sends (AIO-515)",
    async () => {
      const green = [row({ thread_key: "group:shared" })];
      const carmen = [
        row({ thread_key: "group:shared", message_id: "dup" }),
        row({ thread_key: "group:carmen-only", message_id: "client" }),
        row({
          thread_key: "group:carmen-only",
          message_id: "carmen-send",
          direction: "outbound",
          sent_by_user_id: null,
        }),
        row({
          thread_key: "group:carmen-only",
          message_id: "person-send",
          direction: "outbound",
          sent_by_user_id: "u1",
        }),
        row({ thread_key: "dm:x:972", thread_kind: "dm", message_id: "dm" }),
      ];
      const { db, calls } = recordingClient(({ body }) =>
        providerOf(body) === "manus_wa" ? carmen : green,
      );
      const read = await loadThreadActivity(
        db,
        { ...query, carmenConnectionIds: ["carmen-line"] },
        "chat_sla",
      );
      assertEquals(
        read.rows.map((r) => [r.thread_key, r.message_id]),
        [
          ["group:shared", green[0].message_id],
          ["group:carmen-only", "client"],
          ["group:carmen-only", "person-send"],
        ],
      );
      assertEquals(
        calls.map((c) => [
          providerOf(c.body),
          c.body &&
          typeof c.body === "object" &&
          "p_connection_user_ids" in c.body
            ? c.body.p_connection_user_ids
            : null,
        ]),
        [
          ["green_api", ["owner"]],
          ["manus_wa", ["carmen-line"]],
        ],
      );
    },
  );

  await t.step("no Carmen line: no Manus read", async () => {
    const { db, calls } = recordingClient(() => [row()]);
    await loadThreadActivity(db, query, "chat_sla");
    assertEquals(
      calls.map((c) => providerOf(c.body)),
      ["green_api"],
    );
  });

  await t.step(
    "names the tenant, the lines, the provider, the collector and a person's sends",
    async () => {
      const { db, calls } = recordingClient(() => [row()]);
      const read = await loadThreadActivity(db, query, "chat_sla");
      assertEquals([read.rows.length, read.complete], [1, true]);
      assertEquals(calls[0].path, "rpc/get_client_thread_activity");
      assertEquals(calls[0].body, {
        p_tenant_id: TENANT,
        p_connection_user_ids: ["owner"],
        p_since: NOW.toISOString(),
        p_collector: "chat_sla",
        p_person_send_kinds: [
          "chat",
          "report",
          "dashboard_share",
          "meeting_summary",
        ],
        p_provider: "green_api",
        p_per_thread: 15,
      });
    },
  );

  await t.step(
    "pages by thread: a thread the row cap cut is read whole next",
    async () => {
      const first = [...rows("a", 15), ...rows("b", 980), ...rows("c", 5)];
      const { db, calls } = recordingClient(({ body }) =>
        afterKey(body) ? rows("c", 12) : first,
      );
      const read = await loadThreadActivity(db, query, "chat_sla");
      const count = (key: string) =>
        read.rows.filter((r) => r.thread_key === key).length;
      assertEquals([count("a"), count("b"), count("c")], [15, 980, 12]);
      assertEquals(read.complete, true);
      assertEquals(
        calls.map((c) => [c.query.get("limit"), afterKey(c.body)]),
        [
          ["1000", undefined],
          ["1000", "b"],
        ],
      );
    },
  );

  await t.step("past the page cap the read is incomplete", async () => {
    let page = 0;
    const { db } = recordingClient(() => {
      page += 1;
      return [...rows(`t${page}`, 999), ...rows(`u${page}`, 1)];
    });
    const read = await loadThreadActivity(db, query, "chat_sla");
    assertEquals([read.complete, read.rows.length], [false, 20 * 999]);
  });

  await t.step("a failed read throws", async () => {
    const { db } = recordingClient(() => ({ message: "boom" }), {
      status: 500,
    });
    await assertRejects(
      () => loadThreadActivity(db, query, "chat_sla"),
      Error,
      "boom",
    );
  });
});

Deno.test("loadUnlinkedGroups", async (t) => {
  await t.step("names the tenant, the lines and the provider", async () => {
    const { db, calls } = recordingClient(() => []);
    await loadUnlinkedGroups(db, query);
    assertEquals(calls[0].path, "rpc/get_unlinked_client_groups");
    assertEquals(calls[0].body, {
      p_tenant_id: TENANT,
      p_connection_user_ids: ["owner"],
      p_since: NOW.toISOString(),
      p_provider: "green_api",
    });
  });

  await t.step(
    "adds Carmen's unlinked groups once, beside the Green lines' (AIO-515)",
    async () => {
      const group = (id: string) => ({ group_id: id, group_name: id });
      const { db } = recordingClient(({ body }) =>
        providerOf(body) === "manus_wa"
          ? [group("both"), group("carmen")]
          : [group("both")],
      );
      const found = await loadUnlinkedGroups(db, {
        ...query,
        carmenConnectionIds: ["carmen-line"],
      });
      assertEquals(
        found.map((g) => g.group_id),
        ["both", "carmen"],
      );
    },
  );
});
