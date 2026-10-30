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
    "warns about an unreachable list only on a run that reports",
    () => {
      assertMatch(
        source,
        /if \(deliveryClaimed \|\| instantAlerts\.sent > 0\) \{\s*warnListUnreachable\(/,
      );
    },
  );
});
