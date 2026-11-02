import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../../tests/recording-client.ts";
import { CLIENT, GROUP } from "./group-fixtures.ts";
import { loadGroupHistories } from "./messages.ts";

const since = new Date("2026-11-01T00:00:00Z");

Deno.test("loadGroupHistories", async (t) => {
  await t.step(
    "asks the service function for this tenant and parses messages",
    async () => {
      const row = {
        client_id: CLIENT,
        client_name: "א",
        group_id: GROUP,
        group_name: "ג",
        messages: [
          {
            id: "b",
            at: "2026-11-01T10:00:00Z",
            out: true,
            key: null,
            text: "שני",
          },
          {
            id: "a",
            at: "2026-11-01T09:00:00Z",
            out: false,
            key: "521111111",
            lid_unmapped: false,
            text: "ראשון",
          },
          {
            id: "c",
            at: "2026-11-01T09:45:00Z",
            out: false,
            key: null,
            lid_unmapped: true,
            text: "שלישי",
          },
          { at: "2026-11-01T09:30:00Z", text: "בלי מזהה" },
        ],
      };
      const { db, calls } = recordingClient(() => [row]);
      const [history] = await loadGroupHistories(
        db,
        { tenantId: "t1", connectionIds: ["line"], since, clientIds: [CLIENT] },
        "group_updates",
      );
      assertEquals(
        history.messages.map((m) => [m.id, m.lidUnmapped]),
        [
          ["a", false],
          ["c", true],
          ["b", false],
        ],
      );
      assertEquals(calls[0].path, "rpc/get_client_group_digest_messages");
      assertEquals(calls[0].body, {
        p_tenant_id: "t1",
        p_connection_user_ids: ["line"],
        p_since: since.toISOString(),
        p_collector: "group_updates",
        p_provider: "green_api",
        p_client_ids: [CLIENT],
        p_per_group: 60,
      });
    },
  );

  await t.step("no monitored line: no read", async () => {
    const { db, calls } = recordingClient(() => []);
    const query = { tenantId: "t1", connectionIds: [], since, clientIds: null };
    assertEquals(await loadGroupHistories(db, query, "group_updates"), []);
    assertEquals(calls, []);
  });
});
