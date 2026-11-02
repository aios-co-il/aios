import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { NOW } from "./fake-deps.ts";
import { type RefreshRecord, withRefreshNote } from "./result.ts";

const REFRESHED: RefreshRecord = {
  status: "refreshed",
  previous_calculated_at: "2026-10-26T04:00:00Z",
  min_interval_minutes: 10,
  clients: 12,
};

Deno.test("withRefreshNote", async (t) => {
  await t.step(
    "a refresh keeps the pulse and adds the record, the note and the instructions",
    () => {
      const result = withRefreshNote(
        {
          count: 12,
          freshness: "2026-10-26T10:00:00Z",
          whatsapp_digest: "🟢 12 תקינים",
          instructions_to_agent: "הנחיית הדופק",
        },
        REFRESHED,
        NOW,
      );
      assertEquals(Object.keys(result), [
        "count",
        "freshness",
        "whatsapp_digest",
        "instructions_to_agent",
        "auto_refreshed",
        "refresh",
        "refresh_note",
      ]);
      assertStrictEquals(result.auto_refreshed, true);
      assertStrictEquals(result.refresh, REFRESHED);
      assertStrictEquals(
        result.instructions_to_agent,
        "פתחי בשורת refresh_note כלשונה. הנחיית הדופק",
      );
    },
  );

  await t.step(
    "a skipped refresh tells Carmen not to claim new numbers or call again",
    () => {
      const result = withRefreshNote(
        { count: 3, freshness: "2026-10-26T09:55:00Z" },
        { ...REFRESHED, status: "fresh_snapshot" },
        NOW,
      );
      assertStrictEquals(result.auto_refreshed, false);
      assertStrictEquals(
        result.instructions_to_agent,
        "פתחי בשורת refresh_note כלשונה. הרענון לא רץ עכשיו: אל תטעני שהנתונים חושבו מחדש, ואל תקראי שוב ל-refresh_campaign_pulse באותה שיחה.",
      );
    },
  );
});
