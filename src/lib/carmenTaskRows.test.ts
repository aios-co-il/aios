import { expect, test } from "vitest";
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
  expect(
    agentTaskScheduleLabel({
      schedule_type: "recurring",
      cron_expression: "0 9 * * *",
      next_run: null,
    }),
  ).toBe("כל יום ב-09:00 · לא תוזמנה");
  expect(
    agentTaskScheduleLabel({
      schedule_type: "recurring",
      cron_expression: "0 9 * * *",
      next_run: "2026-12-01T07:00:00Z",
    }),
  ).toBe("כל יום ב-09:00");
});

test("a completed recurring task stays scheduled, a completed one-off is done", () => {
  expect(agentTaskStatus({ schedule_type: "daily", status: "completed" })).toBe(
    "scheduled",
  );
  expect(agentTaskStatus({ schedule_type: "once", status: "completed" })).toBe(
    "done",
  );
  expect(
    agentTaskStatus({
      schedule_type: "recurring",
      status: "pending",
      enabled: false,
    }),
  ).toBe("paused");
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
  expect(row.kind).toBe("recurring");
  expect(row.executorLabel).toBe("כרמן · gpt-5");
  expect(row.nextRunAt).toBe("2026-12-01T07:00:00Z");
  expect(row.key).toBe("agent_tasks:t1");
});

test("goals and dev tasks map to unified statuses", () => {
  expect(
    mapGoal({
      id: "g",
      title: "x",
      status: "active",
      autonomous_mode: true,
      engine_status: "EXECUTING",
    }).status,
  ).toBe("running");
  expect(mapGoal({ id: "g", title: "x", status: "completed" }).status).toBe(
    "done",
  );
  expect(
    mapDevTask({ id: "d", title: "x", status: "sent_to_cursor" }).status,
  ).toBe("running");
  expect(mapDevTask({ id: "d", title: "x", status: "draft" }).status).toBe(
    "draft",
  );
});

test("cron jobs: inactive is paused, failed last run is failed", () => {
  const meta = { label: "בדיקת דופק בוקר", description: "" };
  expect(
    mapCronJob({ jobid: 1, schedule: "30 7 * * *", active: false }, meta)
      .status,
  ).toBe("paused");
  expect(
    mapCronJob(
      { jobid: 1, schedule: "30 7 * * *", active: true, last_status: "failed" },
      meta,
    ).status,
  ).toBe("failed");
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
  expect(selectRows(rows, "all").map((r) => r.id)).toStrictEqual([
    "c",
    "b",
    "g",
  ]);
  expect(
    selectRows(rows, "all", { showFinished: true }).map((r) => r.id),
  ).toStrictEqual(["c", "b", "g", "a"]);
  expect(selectRows(rows, "goal").map((r) => r.id)).toStrictEqual(["g"]);
  expect(selectRows(rows, "running").map((r) => r.id)).toStrictEqual(["c"]);
  expect(
    selectRows(rows, "all", { search: "goal" }).map((r) => r.id),
  ).toStrictEqual(["g"]);
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
    expect(back.preset, cron).toBe(s.preset);
    expect(buildCron(back)).toBe(cron);
  }
  expect(
    buildCron({
      ...DEFAULT_RECURRING,
      preset: "weekly",
      weekday: 0,
      time: "08:00",
    }),
  ).toBe("0 8 * * 0");
  expect(scheduleFromCron("5 4 * 2 *").preset).toBe("custom");
});

test("isUsableCron rejects every-minute schedules", () => {
  expect(isUsableCron("* * * * *")).toBe(false);
  expect(isUsableCron("*/15 * * * *")).toBe(true);
  expect(isUsableCron("0 9 * * *")).toBe(true);
  expect(isUsableCron("nonsense")).toBe(false);
});
