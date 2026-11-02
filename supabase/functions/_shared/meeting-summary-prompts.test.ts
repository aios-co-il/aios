import {
  assert,
  assertMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  buildExtractionSystemPrompt,
  buildMeetingSummaryCursorTask,
  buildSummaryUserPrompt,
  LONG_TRANSCRIPT_THRESHOLD,
  MEETING_SUMMARY_SYSTEM_PROMPT,
  meetingSummaryIdempotencyKey,
  meetingSummaryJobFromMetadata,
  prepareDetailedSummarySource,
  splitTranscript,
  TRANSCRIPT_CHUNK_SIZE,
} from "./meeting-summary-prompts.ts";

Deno.test(
  "long transcripts are split on speaker-line boundaries without losing content",
  () => {
    const lines = Array.from(
      { length: 900 },
      (_, index) =>
        `[${String(index).padStart(4, "0")}] דובר: פרט אופרטיבי ${index}`,
    );
    const transcript = lines.join("\n");
    assert(transcript.length > LONG_TRANSCRIPT_THRESHOLD);

    const chunks = splitTranscript(transcript);

    assert(chunks.length > 1);
    assert(chunks.every((chunk) => chunk.length <= TRANSCRIPT_CHUNK_SIZE));
    assertStrictEquals(chunks.join("\n"), transcript);
  },
);

Deno.test(
  "summary prompt requires exhaustive detail and forbids inferred deadlines",
  () => {
    assertMatch(MEETING_SUMMARY_SYSTEM_PROMPT, /שמור כל פרט אופרטיבי מהותי/);
    assertMatch(MEETING_SUMMARY_SYSTEM_PROMPT, /אל תהפוך תאריך פגישה.*לדדליין/);
    assertMatch(MEETING_SUMMARY_SYSTEM_PROMPT, /שאלות פתוחות ונושאים להכרעה/);
    assertMatch(
      MEETING_SUMMARY_SYSTEM_PROMPT,
      /לעולם אל תשלים אותם לפי ההיגיון/,
    );
  },
);

Deno.test(
  "extraction and synthesis prompts preserve source context and user focus",
  () => {
    const extractionPrompt = buildExtractionSystemPrompt(2, 4);
    assertMatch(extractionPrompt, /חלק 2 מתוך 4/);
    assertMatch(extractionPrompt, /כל משימה או התחייבות/);
    assertMatch(extractionPrompt, /אל תסיק דדליין מתאריך אחר/);

    const userPrompt = buildSummaryUserPrompt(
      "דוד: לבדוק את מקור הלידים",
      "נושא הפגישה: קמפיינים",
      "\nדגש: משימות",
    );
    assertMatch(userPrompt, /נושא הפגישה: קמפיינים/);
    assertMatch(userPrompt, /דוד: לבדוק את מקור הלידים/);
    assertMatch(userPrompt, /דגש: משימות/);
  },
);

Deno.test(
  "cursor summary task keeps the source and forbids mixing clients",
  () => {
    const task = buildMeetingSummaryCursorTask(
      "בינת: 20 שקל לליד",
      "נושא: בינת",
      "",
    );
    assertMatch(task, /write one Hebrew Markdown meeting summary/);
    assertMatch(task, /אל תערוך קוד/);
    assertMatch(task, /בינת: 20 שקל לליד/);
    assertMatch(task, /אל תערבב החלטות בין הלקוחות/);
  },
);

Deno.test(
  "automatic summary sends share one key and a manual resend uses another",
  () => {
    assertStrictEquals(
      meetingSummaryIdempotencyKey("rec-1"),
      "meeting-summary:rec-1",
    );
    assertStrictEquals(
      meetingSummaryIdempotencyKey("rec-1"),
      meetingSummaryIdempotencyKey("rec-1"),
    );
    assertNotStrictEquals(
      meetingSummaryIdempotencyKey("rec-1", true),
      meetingSummaryIdempotencyKey("rec-1"),
    );
  },
);

Deno.test(
  "meeting summary jobs are recognized only with a complete target",
  () => {
    assertStrictEquals(
      meetingSummaryJobFromMetadata({ purpose: "other" }),
      null,
    );
    assertStrictEquals(
      meetingSummaryJobFromMetadata({
        purpose: "meeting_summary",
        recording_id: "rec",
        target_type: "client",
        target_id: "",
        target_name: "בינת",
        tenant_id: "ten",
      }),
      null,
    );
    const job = meetingSummaryJobFromMetadata({
      purpose: "meeting_summary",
      recording_id: "rec",
      target_type: "client",
      target_id: "client",
      target_name: "בינת הופמן",
      tenant_id: "ten",
      created_by: "user",
      client_id: "client",
      brief_source: "meeting_bot",
    });
    assertStrictEquals(job?.target_name, "בינת הופמן");
    assertStrictEquals(job?.brief_source, "meeting_bot");
  },
);

Deno.test(
  "long meetings run a complete extraction pass before final synthesis",
  async () => {
    const transcript = Array.from(
      { length: 900 },
      (_, index) => `[${index}] דובר: נושא ${index}`,
    ).join("\n");
    const calls: Array<{ system: string; user: string; maxTokens: number }> =
      [];

    const source = await prepareDetailedSummarySource(
      transcript,
      async (system, user, maxTokens) => {
        calls.push({ system, user, maxTokens });
        return `ממצאים ${calls.length}`;
      },
    );

    assert(calls.length > 1);
    assert(calls.every((call) => call.maxTokens === 4_000));
    assertMatch(calls[0].system, /שלב חילוץ עובדות/);
    assertMatch(
      calls.at(-1)!.user,
      new RegExp(`חלק ${calls.length} מתוך ${calls.length}`),
    );
    assertMatch(source, /### ממצאים מחלק 1\nממצאים 1/);
    assertMatch(
      source,
      new RegExp(`### ממצאים מחלק ${calls.length}\\nממצאים ${calls.length}`),
    );
  },
);
