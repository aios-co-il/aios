import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { verifyReportVsMeta } from "./verify-report-vs-meta.ts";
import { table, tokenDb } from "./verify-fixtures.ts";

describe("verifyReportVsMeta", () => {
  it("lists a client whose yesterday is not synced yet as not compared, never as matching", async () => {
    // "תבדקי את הדוח של אתמול מול מטא" at 01:30 UTC, before the morning sync.
    const requests: string[] = [];
    const out = await verifyReportVsMeta({
      db: tokenDb(),
      tables: [{ ...table, last_sync_at: "2026-10-26T11:45:00Z" }],
      days: 1,
      now: new Date("2026-10-27T01:30:00Z"),
      fetch: (url) => {
        requests.push(url);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              account_id: "1",
              name: "Ads",
              currency: "ILS",
              timezone_name: "Asia/Jerusalem",
            }),
          ),
        );
      },
    });
    assertEquals(
      {
        checked: out.checked,
        ok_count: out.ok_count,
        ok_clients: out.ok_clients,
        problems: out.problems,
        not_yet_synced: out.not_yet_synced,
      },
      {
        checked: 0,
        ok_count: 0,
        ok_clients: [],
        problems: [],
        not_yet_synced: [{ client: "לקוח", dates: ["2026-10-26"] }],
      },
    );
    // Only the account (for its time zone) was read; nothing to compare.
    assertStrictEquals(requests.length, 1);
    // AIOS may already hold part of the day (the sync ran before it ended), so
    // the note must not tell Carmen there is no data.
    const note = String(out.not_yet_synced_note);
    assertStrictEquals(note.includes("לפני שהימים האלה הסתיימו"), true);
    assertStrictEquals(note.includes("נתונים חלקיים"), true);
    assertStrictEquals(note.includes("אין נתונים"), false);
  });

  it("stops the live check at a Meta rate limit instead of trying every table", async () => {
    let requests = 0;
    const out = await verifyReportVsMeta({
      db: tokenDb(),
      tables: [table, { ...table, id: "t2", client_name: "לקוח 2" }],
      days: 7,
      now: new Date("2026-10-26T09:00:00Z"),
      concurrency: 1,
      sleep: () => Promise.resolve(),
      fetch: () => {
        requests += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 4, message: "Application request limit reached" },
            }),
            { status: 400 },
          ),
        );
      },
    });
    // One request plus two retries for the first table, none for the second.
    assertStrictEquals(requests, 3);
    assertEquals(out.not_checked, ["לקוח 2"]);
    assertStrictEquals(String(out.note).startsWith("מטא הגבילה"), true);
  });
});
