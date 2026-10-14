import assert from "node:assert/strict";
import test from "node:test";
import {
  agentTaskScheduleLabel,
  agentTaskStatus,
  mapAgentTask,
  mapCronJob,
  mapDevTask,
  mapGoal,
  selectRows,
} from "./carmenTaskRows.ts";
import {
  DEFAULT_RECURRING,
  buildCron,
  isUsableCron,
  scheduleFromCron,
} from "./taskSchedulePresets.ts";

test("recurring cron task without next_run is flagged as not scheduled", () => {
  assert.equal(
    agentTaskScheduleLabel({
      schedule_type: "recurring",
      cron_expression: "0 9 * * *",
      next_run: null,
    }),
    "כל יום ב-09:00 · לא תוזמנה",
  );
  assert.equal(
    agentTaskScheduleLabel({
      schedule_type: "recurring",
      cron_expression: "0 9 * * *",
      next_run: "2026-12-01T07:00:00Z",
    }),
    "כל יום ב-09:00",
  );
});

test("a completed recurring task stays scheduled, a completed one-off is done", () => {
  assert.equal(
    agentTaskStatus({ schedule_type: "daily", status: "completed" }),
    "scheduled",
  );
  assert.equal(
    agentTaskStatus({ schedule_type: "once", status: "completed" }),
    "done",
  );
  assert.equal(
    agentTaskStatus({
      schedule_type: "recurring",
      status: "pending",
      enabled: false,
    }),
    "paused",
  );
});

test("mapAgentTask: kind, executor and next run", () => {
  const row = mapAgentTask({
    id: "t1",
    title: "בדיקת דופק",
    schedule_type: "recurring",
    cron_expression: "0 9 * * *",
    next_run: "2026-12-01T07:00:00Z",
    status: "pending",
    enabled: true,
    engine_model: "gpt-5",
    ai_agents: { name: "כרמן" },
  });
  assert.equal(row.kind, "recurring");
  assert.equal(row.executorLabel, "כרמן · gpt-5");
  assert.equal(row.nextRunAt, "2026-12-01T07:00:00Z");
  assert.equal(row.key, "agent_tasks:t1");
});

test("goals and dev tasks map to unified statuses", () => {
  assert.equal(
    mapGoal({
      id: "g",
      title: "x",
      status: "active",
      autonomous_mode: true,
      engine_status: "EXECUTING",
    }).status,
    "running",
  );
  assert.equal(
    mapGoal({ id: "g", title: "x", status: "completed" }).status,
    "done",
  );
  assert.equal(
    mapDevTask({ id: "d", title: "x", status: "sent_to_cursor" }).status,
    "running",
  );
  assert.equal(
    mapDevTask({ id: "d", title: "x", status: "draft" }).status,
    "draft",
  );
});

test("cron jobs: inactive is paused, failed last run is failed", () => {
  const meta = { label: "בדיקת דופק בוקר", description: "" };
  assert.equal(
    mapCronJob({ jobid: 1, schedule: "30 7 * * *", active: false }, meta)
      .status,
    "paused",
  );
  assert.equal(
    mapCronJob(
      { jobid: 1, schedule: "30 7 * * *", active: true, last_status: "failed" },
      meta,
    ).status,
    "failed",
  );
});

test("selectRows hides finished items, filters by kind and sorts running first", () => {
  const rows = [
    mapAgentTask({
      id: "a",
      title: "done",
      schedule_type: "once",
      status: "completed",
    }),
    mapAgentTask({
      id: "b",
      title: "waiting",
      schedule_type: "once",
      status: "pending",
    }),
    mapAgentTask({
      id: "c",
      title: "running",
      schedule_type: "once",
      status: "running",
    }),
    mapGoal({ id: "g", title: "goal", status: "active" }),
  ];
  assert.deepEqual(
    selectRows(rows, "all").map((r) => r.id),
    ["c", "b", "g"],
  );
  assert.deepEqual(
    selectRows(rows, "all", { showFinished: true }).map((r) => r.id),
    ["c", "b", "g", "a"],
  );
  assert.deepEqual(
    selectRows(rows, "goal").map((r) => r.id),
    ["g"],
  );
  assert.deepEqual(
    selectRows(rows, "running").map((r) => r.id),
    ["c"],
  );
  assert.deepEqual(
    selectRows(rows, "all", { search: "goal" }).map((r) => r.id),
    ["g"],
  );
});

test("schedule presets round-trip through cron", () => {
  const cases = [
    { ...DEFAULT_RECURRING, preset: "daily" as const, time: "09:30" },
    { ...DEFAULT_RECURRING, preset: "weekdays" as const, time: "08:00" },
    {
      ...DEFAULT_RECURRING,
      preset: "weekly" as const,
      time: "08:00",
      weekday: 0,
    },
    {
      ...DEFAULT_RECURRING,
      preset: "monthly" as const,
      time: "07:15",
      monthDay: 3,
    },
    {
      ...DEFAULT_RECURRING,
      preset: "every_minutes" as const,
      everyMinutes: 15,
    },
  ];
  for (const s of cases) {
    const cron = buildCron(s);
    const back = scheduleFromCron(cron);
    assert.equal(back.preset, s.preset, cron);
    assert.equal(buildCron(back), cron);
  }
  assert.equal(
    buildCron({
      ...DEFAULT_RECURRING,
      preset: "weekly",
      weekday: 0,
      time: "08:00",
    }),
    "0 8 * * 0",
  );
  assert.equal(scheduleFromCron("5 4 * 2 *").preset, "custom");
});

test("isUsableCron rejects every-minute schedules", () => {
  assert.equal(isUsableCron("* * * * *"), false);
  assert.equal(isUsableCron("*/15 * * * *"), true);
  assert.equal(isUsableCron("0 9 * * *"), true);
  assert.equal(isUsableCron("nonsense"), false);
});
