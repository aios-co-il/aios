import { assertEquals } from "jsr:@std/assert@1";
import { recordingClient } from "../../tests/recording-client.ts";
import { CARD_ENTRY_LIMIT, loadCardEntries } from "./card-entries.ts";
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
        source_ref: null,
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

  await t.step("reaching the read limit is logged, not silent", async () => {
    const row = {
      client_id: CLIENT,
      created_at: "2026-11-01T10:00:00Z",
      source: "human",
      source_ref: null,
      content: "x",
    };
    const { db } = recordingClient(() =>
      Array.from({ length: CARD_ENTRY_LIMIT }, () => row),
    );
    const warned: unknown[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warned.push(args);
    try {
      await loadCardEntries(db, { clientIds: [CLIENT], since });
    } finally {
      console.warn = warn;
    }
    assertEquals(warned.length, 1);
  });

  await t.step("no client: no read", async () => {
    const { db, calls } = recordingClient(() => []);
    assertEquals(await loadCardEntries(db, { clientIds: [], since }), []);
    assertEquals(calls, []);
  });
});
