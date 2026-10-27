import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadCardEntries } from "./card-entries.ts";
import { CLIENT } from "./group-fixtures.ts";

const since = new Date("2026-11-01T00:00:00Z");

Deno.test("loadCardEntries", async (t) => {
  await t.step(
    "reads the shared card of the clients in play, whoever wrote on it",
    async () => {
      const partnerEntry = {
        client_id: CLIENT,
        created_at: "2026-11-01T10:00:00Z",
        source: "human",
        content: "עדכון מהשותף",
      };
      const { db, calls } = recordingClient(() => [partnerEntry]);
      const entries = await loadCardEntries(db, { clientIds: [CLIENT], since });
      assertEquals(entries, [partnerEntry]);
      const query = calls[0].query;
      assertEquals(calls[0].path, "client_updates");
      assertEquals(query.get("tenant_id"), null);
      assertEquals(query.get("client_id"), `in.(${CLIENT})`);
    },
  );

  await t.step("no client: no read", async () => {
    const { db, calls } = recordingClient(() => []);
    assertEquals(await loadCardEntries(db, { clientIds: [], since }), []);
    assertEquals(calls, []);
  });
});
