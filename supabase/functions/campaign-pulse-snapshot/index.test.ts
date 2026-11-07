import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";

/**
 * The handler cannot run without a database, so its wiring is read from the
 * source. The run logic itself is tested through the modules it calls
 * (scoped-delivery.test.ts, report-digest.test.ts).
 */
const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("campaign-pulse-snapshot wiring", async (t) => {
  await t.step(
    "the digest and instant alerts read the report recipients",
    () => {
      assertMatch(source, /loadCarmenReportRecipients\(supabase, tenantId\)/);
      assertMatch(source, /reportRecipients: report\.recipients/);
      assertNotMatch(source, /campaign_pulse_phone/);
    },
  );

  await t.step(
    "the run flags go to the digest, and its result to the scoped step",
    () => {
      assertMatch(
        source,
        /deliverReportDigest\(\{\s*tenantId,\s*recipients: report\.recipients,[^}]*previewOnly: previewOnlyDelivery,\s*campaignerName: campaignerNameFilter,/,
      );
      assertMatch(
        source,
        /deliverScopedPulseRecipients\(\{[^}]*previewOnly: previewOnlyDelivery,\s*reportDigest,/,
      );
    },
  );

  await t.step(
    "the org's own lost connections reach the instant alerts, even with no client",
    () => {
      assertMatch(
        source,
        /loadOpenIntegrationDisconnects\(\s*supabase,\s*tenantId,?\s*\)/,
      );
      assertMatch(
        source,
        /if \(snapshots\.length \|\| openDisconnects\.disconnects\.length\) \{/,
      );
      assertMatch(source, /disconnects: openDisconnects\.disconnects,/);
    },
  );

  await t.step(
    "the client goal mode comes from its campaigns' report goals (AIO-494)",
    () => {
      assertMatch(
        source,
        /const goalMode = clientGoalModeOf\(\{\s*records,\s*goalOf: \(row\) => verdictOf\(row\)\?\.goal,\s*tables: activeTables,\s*sinceYmd: windows\.recent30Start,/,
      );
      assertMatch(
        source,
        /goalTables\(\s*activeTables,\s*"ecommerce",\s*ecommerceRecords,?\s*\)/,
      );
    },
  );

  await t.step(
    "the client's no-results days reach the rows and both client statuses (AIO-502)",
    () => {
      assertMatch(
        source,
        /\.from\("clients"\)\s*\.select\(\s*"[^"]*pulse_no_results_days[^"]*"/,
      );
      assertMatch(
        source,
        /noResultsDaysByClient: noResultsDaysByClientOf\(client\)/,
      );
      assertMatch(
        source,
        /noResultsWindow: clientNoResultsWindow\(\s*client,\s*leadRecords,\s*"leads",\s*windows\.end,?\s*\)/,
      );
      assertMatch(
        source,
        /noResultsWindow: clientNoResultsWindow\(\s*client,\s*ecommerceRecords,\s*"ecommerce",\s*windows\.end,?\s*\)/,
      );
    },
  );

  await t.step(
    "warns about an unreachable list only on a run that reports",
    () => {
      assertMatch(
        source,
        /if \(deliveryClaimed \|\| instantAlerts\.sent > 0\) \{\s*warnListUnreachable\(/,
      );
    },
  );
});
