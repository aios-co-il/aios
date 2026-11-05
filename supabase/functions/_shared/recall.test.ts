import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  recallTranscriptToText,
  RecallApiError,
  isRecallCreditError,
  isRecallCreditHttp,
  formatRecallBotHours,
  recallBillingDashboardUrl,
  recallCreditErrorMessage,
  recallBudgetThreshold,
  shouldRunRecallCreditCanary,
} from "./recall.ts";

// Shape of Recall's v1.11 transcript download: a top-level array of
// per-participant segments, each holding a flat list of words.
const v111Download = [
  {
    participant: { id: 1, name: "דוד" },
    language_code: "he",
    words: [
      { text: "שלום", start_timestamp: { relative: 0.5 } },
      { text: "כרמן", start_timestamp: { relative: 1.0 } },
      // 10s pause — should start a new line for the same speaker.
      { text: "נתחיל", start_timestamp: { relative: 11.0 } },
    ],
  },
  {
    participant: { id: 2, name: "רונית" },
    language_code: "he",
    words: [
      { text: "בוקר", start_timestamp: { relative: 3.0 } },
      { text: "טוב", start_timestamp: { relative: 3.4 } },
    ],
  },
];

Deno.test(
  "parses the v1.11 top-level array download into a speaker timeline",
  () => {
    const text = recallTranscriptToText(v111Download);
    assertStrictEquals(
      text,
      [
        "[00:00] דוד: שלום כרמן",
        "[00:03] רונית: בוקר טוב",
        "[00:11] דוד: נתחיל",
      ].join("\n"),
    );
  },
);

Deno.test("orders lines by timestamp across participants", () => {
  const lines = recallTranscriptToText(v111Download).split("\n");
  assertEquals(
    lines.map((l) => l.slice(1, 6)),
    ["00:00", "00:03", "00:11"],
  );
});

Deno.test("returns empty string for a transcript with no words yet", () => {
  assertStrictEquals(recallTranscriptToText([]), "");
  assertStrictEquals(
    recallTranscriptToText([
      { participant: { id: 1, name: "דוד" }, words: [] },
    ]),
    "",
  );
});

Deno.test(
  "falls back to participant names when a segment has no display name",
  () => {
    const text = recallTranscriptToText([
      {
        participant: { id: 7 },
        words: [{ text: "בדיקה", start_timestamp: { relative: 2 } }],
      },
    ]);
    assertStrictEquals(text, "[00:02] משתתף: בדיקה");
  },
);

Deno.test("still supports the utterances schema", () => {
  const text = recallTranscriptToText({
    utterances: [
      {
        participant: { id: 1, name: "דוד" },
        words: [{ text: "היי", start_timestamp: { relative: 0 } }],
      },
    ],
  });
  assertStrictEquals(text, "[00:00] דוד: היי");
});

Deno.test("still supports a plain text transcript", () => {
  assertStrictEquals(
    recallTranscriptToText({ text: "תמלול פשוט" }),
    "תמלול פשוט",
  );
});

Deno.test("detects Recall 402 as a credit error", () => {
  assertStrictEquals(isRecallCreditHttp(402, ""), true);
  assertStrictEquals(
    isRecallCreditHttp(400, "insufficient credit balance"),
    true,
  );
  assertStrictEquals(isRecallCreditHttp(500, "oops"), false);
  const err = new RecallApiError(
    402,
    '{"code":"payment_required"}',
    recallCreditErrorMessage("eu-central-1"),
  );
  assertStrictEquals(isRecallCreditError(err), true);
  assertMatch(
    err.message,
    /eu-central-1\.recall\.ai\/dashboard\/billing\/usage/,
  );
  assertStrictEquals(
    isRecallCreditError(new Error("Recall create bot failed (502): nope")),
    false,
  );
});

Deno.test("formats bot hours and billing dashboard URL", () => {
  assertStrictEquals(formatRecallBotHours(30), "1 דק׳");
  assertStrictEquals(formatRecallBotHours(3600), "1.0 שעות");
  assertStrictEquals(formatRecallBotHours(18 * 3600), "18 שעות");
  assertStrictEquals(
    recallBillingDashboardUrl("eu-central-1"),
    "https://eu-central-1.recall.ai/dashboard/billing/usage",
  );
});

Deno.test("budget thresholds fire at 80% then 95%", () => {
  assertStrictEquals(recallBudgetThreshold(7.9 * 3600, 10), null);
  assertStrictEquals(recallBudgetThreshold(8 * 3600, 10), "budget_80");
  assertStrictEquals(recallBudgetThreshold(9.5 * 3600, 10), "budget_95");
  assertStrictEquals(recallBudgetThreshold(100, 0), null);
});

Deno.test(
  "credit canary runs on first check, every 3h while ok, every 30m while down",
  () => {
    const now = Date.parse("2026-08-26T12:00:00Z");
    assertStrictEquals(shouldRunRecallCreditCanary([], now), true);

    const okRecent = [
      {
        status: "ok",
        detail: "קרדיט פעיל · 1.0 שעות החודש · נבדק עכשיו",
        checked_at: "2026-08-26T10:00:00Z", // 2h ago
      },
    ];
    assertStrictEquals(shouldRunRecallCreditCanary(okRecent, now), false);

    const okStale = [
      {
        status: "ok",
        detail: "קרדיט פעיל · נבדק עכשיו",
        checked_at: "2026-08-26T08:59:00Z", // 3h1m ago
      },
    ];
    assertStrictEquals(shouldRunRecallCreditCanary(okStale, now), true);

    const downFresh = [
      {
        status: "down",
        detail: "הקרדיט נגמר · נבדק עכשיו",
        checked_at: "2026-08-26T11:45:00Z", // 15m ago
      },
    ];
    assertStrictEquals(shouldRunRecallCreditCanary(downFresh, now), false);

    const downStale = [
      {
        status: "down",
        detail: "הקרדיט נגמר · נבדק עכשיו",
        checked_at: "2026-08-26T11:29:00Z", // 31m ago
      },
    ];
    assertStrictEquals(shouldRunRecallCreditCanary(downStale, now), true);

    // Cached rows without the marker should not hide the last real canary.
    const cachedAfterCanary = [
      {
        status: "ok",
        detail: "קרדיט פעיל · 1.0 שעות החודש",
        checked_at: "2026-08-26T11:50:00Z",
      },
      {
        status: "ok",
        detail: "קרדיט פעיל · נבדק עכשיו",
        checked_at: "2026-08-26T10:00:00Z",
      },
    ];
    assertStrictEquals(
      shouldRunRecallCreditCanary(cachedAfterCanary, now),
      false,
    );
  },
);
