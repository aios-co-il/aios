import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { withConsoleErrors } from "../testing/console-errors.ts";
import { countCronTables, cronRunBody, cronRunResponse } from "./run-body.ts";

const ADS = { synced: ["synced", "triggered"], failed: ["error"] };

Deno.test("cronRunBody", async (t) => {
  await t.step(
    "every table failed: success false with the counts and 502",
    () => {
      // The Production runs that answered success:true while every table got
      // 400 "Google Ads not connected".
      const counts = countCronTables(
        [{ status: "error" }, { status: "error" }, { status: "error" }],
        ADS,
      );
      assertEquals(cronRunBody(counts, { batch_offset: 0 }), {
        status: 502,
        body: {
          success: false,
          tables_synced: 0,
          tables_failed: 3,
          tables_skipped: 0,
          batch_offset: 0,
        },
      });
    },
  );

  await t.step("some synced: success, and the failures still counted", () => {
    const counts = countCronTables(
      [{ status: "synced" }, { status: "error" }, { status: "skipped" }],
      ADS,
    );
    assertEquals(cronRunBody(counts), {
      status: 200,
      body: {
        success: true,
        tables_synced: 1,
        tables_failed: 1,
        tables_skipped: 1,
      },
    });
  });

  await t.step("nothing to sync is not a failure", () => {
    assertEquals(
      cronRunBody(countCronTables([{ status: "skipped" }], ADS)).status,
      200,
    );
    assertEquals(cronRunBody(countCronTables([], ADS)).body.success, true);
  });
});

Deno.test("cronRunResponse", async (t) => {
  await t.step(
    "every table failed: a 502 the cron history shows, logged as an error",
    async () => {
      const { result, logged } = await withConsoleErrors(async () =>
        cronRunResponse(
          "cron-ga",
          { synced: 0, failed: 2, skipped: 0 },
          { batch_offset: 6 },
          { "Access-Control-Allow-Origin": "*" },
        ),
      );
      assertEquals(result.status, 502);
      assertEquals(await result.json(), {
        success: false,
        tables_synced: 0,
        tables_failed: 2,
        tables_skipped: 0,
        batch_offset: 6,
      });
      assertStringIncludes(logged, "[cron-ga] every table in this run failed");
    },
  );
});
