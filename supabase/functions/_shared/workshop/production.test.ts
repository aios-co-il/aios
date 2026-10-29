import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { productionReport, productionRunning } from "./production.ts";

const now = Date.parse("2026-10-24T20:00:00Z");
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

Deno.test(
  "jobs nobody claims for minutes are reported as a missing render worker",
  () => {
    const report = productionReport(
      [
        { kind: "clip", status: "queued", created_at: ago(7) },
        { kind: "clip", status: "queued", created_at: ago(6) },
      ],
      { status: "running" },
      now,
    );
    assertStrictEquals(report.stalled, true);
    assertStrictEquals(report.queued, 2);
    assertStrictEquals(report.oldest_queued_min, 7);
    assertMatch(report.summary, /render worker/);
  },
);

Deno.test("fresh queued jobs or any running job are not a stall", () => {
  assertStrictEquals(
    productionReport(
      [{ kind: "clip", status: "queued", created_at: ago(1) }],
      { status: "running" },
      now,
    ).stalled,
    false,
  );
  const busy = productionReport(
    [
      { kind: "clip", status: "queued", created_at: ago(9) },
      { kind: "clip", status: "running", created_at: ago(9) },
    ],
    { status: "running" },
    now,
  );
  assertStrictEquals(busy.stalled, false);
  assertMatch(busy.summary, /1 בעבודה/);
});

Deno.test(
  "a failed production says why, and a finished one says it is on the board",
  () => {
    const failed = productionReport(
      [{ kind: "clip", status: "failed", error: "quota exceeded" }],
      { status: "failed", error: "narration missing" },
      now,
    );
    assertMatch(failed.summary, /narration missing/);
    assertEquals(failed.errors, ["quota exceeded"]);
    assertMatch(productionReport([], { status: "done" }, now).summary, /בלוח/);
    assertMatch(productionReport([], null, now).summary, /אין הפקה/);
  },
);

Deno.test(
  "clips the free preview made instead of the paid engine are reported",
  () => {
    const production = {
      status: "done",
      provider: "higgsfield",
      started_at: ago(30),
    };
    const clip = (provider: string, from: string | null, min = 20) => ({
      kind: "clip",
      status: "completed",
      created_at: ago(min),
      provider,
      fallback_from: from,
    });
    const report = productionReport(
      [
        clip("mock", "higgsfield"),
        clip("mock", "higgsfield"),
        clip("openrouter", "higgsfield"),
        // An earlier production's fallback is not this film's.
        clip("mock", "higgsfield", 90),
      ],
      production,
      now,
    );
    assertStrictEquals(report.preview_clips, 2);
    assertMatch(report.summary, /2 סצנות הונפשו במנוע התצוגה החינמי/);
    assertMatch(report.summary, /Higgsfield/);
    // A preview the user asked for is not a fallback.
    const asked = productionReport(
      [clip("mock", null)],
      { ...production, provider: "mock" },
      now,
    );
    assertStrictEquals(asked.preview_clips, 0);
    assertNotMatch(asked.summary, /התצוגה החינמי/);
  },
);

Deno.test(
  "a running production holds the lock for an hour, as produce_video does",
  () => {
    assertStrictEquals(
      productionRunning({ status: "running", started_at: ago(10) }, now),
      true,
    );
    assertStrictEquals(
      productionRunning({ status: "running", started_at: ago(61) }, now),
      false,
    );
    assertStrictEquals(productionRunning({ status: "running" }, now), true);
    assertStrictEquals(
      productionRunning({ status: "done", started_at: ago(1) }, now),
      false,
    );
    assertStrictEquals(productionRunning(null, now), false);
  },
);

Deno.test(
  "a film finished without its music bed says so, with the reason",
  () => {
    const report = productionReport(
      [
        { kind: "voice", status: "completed", provider: "openrouter" },
        {
          kind: "music",
          status: "failed",
          error: "אין מפתח ElevenLabs למוזיקה. הסרט יורכב בלי מיטת מוזיקה",
        },
        { kind: "render", status: "completed" },
      ],
      { status: "done" },
      now,
    );
    assertMatch(report.summary, /בלי מוזיקת רקע \(אין מפתח ElevenLabs/);
    const withMusic = productionReport(
      [{ kind: "music", status: "completed" }],
      { status: "done" },
      now,
    );
    assertNotMatch(withMusic.summary, /מוזיקת רקע/);
  },
);
