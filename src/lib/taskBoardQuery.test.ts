import { expect, test } from "vitest";
import { startOfDay } from "date-fns";
import {
  buildChatTaskOrFilter,
  buildTaskDueDateOrFilter,
  filterTasksForChatSearch,
  sortTasksForChatList,
  taskAppearsOnTimeGrid,
} from "./taskBoardQuery.ts";

test("buildTaskDueDateOrFilter uses due_date only (no target_date — column may be missing)", () => {
  const filter = buildTaskDueDateOrFilter({
    rangeStart: "2026-08-24",
    rangeEnd: "2026-08-30",
    today: "2026-08-24",
  });
  expect(filter.includes("target_date")).toBe(false);
  expect(filter).toMatch(/due_date\.lt\.2026-08-24/);
  expect(filter).toMatch(/due_date\.gte\.2026-08-24/);
  expect(filter).toMatch(/due_date\.lte\.2026-08-30/);
});

test("buildTaskDueDateOrFilter does not pull all historical untimed or done-undated rows", () => {
  const filter = buildTaskDueDateOrFilter({
    rangeStart: "2026-08-24",
    rangeEnd: "2026-08-30",
    today: "2026-08-28",
  });
  expect(filter.includes("due_time.is.null")).toBe(false);
  expect(filter).toMatch(/due_date\.is\.null/);
  expect(filter).toMatch(/and\(due_date\.is\.null,status\.neq\.done\)/);
  expect(filter).toBe(
    "and(due_date.gte.2026-08-24,due_date.lte.2026-08-30)," +
      "and(due_date.lt.2026-08-28,status.neq.done)," +
      "and(due_date.is.null,status.neq.done)",
  );
});

test("custom range still excludes unbounded untimed and done-undated", () => {
  const filter = buildTaskDueDateOrFilter({
    rangeStart: "2026-08-24",
    rangeEnd: "2026-08-30",
    today: "2026-08-28",
    customStart: "2026-08-01",
    customEnd: "2026-08-31",
  });
  expect(filter).toMatch(/due_date\.gte\.2026-08-01/);
  expect(filter).toMatch(/due_date\.lte\.2026-08-31/);
  expect(filter.includes("due_time.is.null")).toBe(false);
});

test("taskAppearsOnTimeGrid requires date, time, in-range, and not overdue", () => {
  const range = {
    start: startOfDay(new Date("2026-08-24")),
    end: startOfDay(new Date("2026-08-30")),
  };
  const today = startOfDay(new Date("2026-08-24"));

  expect(
    taskAppearsOnTimeGrid(
      { due_date: "2026-08-25", due_time: "10:00:00", status: "open" },
      range,
      today,
    ),
  ).toBe(true);
  expect(
    taskAppearsOnTimeGrid(
      { due_date: "2026-08-25", due_time: null, status: "open" },
      range,
      today,
    ),
  ).toBe(false);
  expect(
    taskAppearsOnTimeGrid(
      { due_date: "2026-09-01", due_time: "10:00:00", status: "open" },
      range,
      today,
    ),
  ).toBe(false);
  // Completed timed tasks stay on the calendar (marked done).
  expect(
    taskAppearsOnTimeGrid(
      { due_date: "2026-08-25", due_time: "10:00:00", status: "done" },
      range,
      today,
    ),
  ).toBe(true);
  // Overdue open tasks stay off the timed grid (backlog); overdue done in-range stay visible.
  expect(
    taskAppearsOnTimeGrid(
      { due_date: "2026-08-20", due_time: "10:00:00", status: "open" },
      range,
      today,
    ),
  ).toBe(false);
});

test("buildChatTaskOrFilter pulls all open work plus recently done", () => {
  const filter = buildChatTaskOrFilter({
    today: "2026-09-17",
    doneSince: "2026-09-03",
  });
  expect(filter).toBe(
    "status.neq.done,and(status.eq.done,updated_at.gte.2026-09-03)",
  );
  expect(filter.includes("due_date.gte")).toBe(false);
});

test("buildChatTaskOrFilter activity period uses created_at", () => {
  const filter = buildChatTaskOrFilter({
    today: "2026-09-17",
    doneSince: "2026-09-03",
    activitySince: "2026-09-01",
  });
  expect(filter).toBe("created_at.gte.2026-09-01");
});

test("filterTasksForChatSearch matches title, client, lead, and campaigner", () => {
  const tasks = [
    {
      title: "לסגור קמפיין",
      notes: null,
      clients: { name: "דלתא" },
      campaigners: { full_name: "נועה" },
    },
    {
      title: "שיחה",
      notes: "לקוח ויזה",
      clients: { name: "אחר" },
      campaigners: { full_name: "דוד" },
    },
    {
      title: "ליד חדש",
      notes: null,
      leads: { company_name: "אורבן", contact_name: "מיכל" },
      campaigners: { full_name: "נועה" },
    },
  ];
  expect(filterTasksForChatSearch(tasks, "קמפיין").length).toBe(1);
  expect(filterTasksForChatSearch(tasks, "דלתא")[0].title).toBe("לסגור קמפיין");
  expect(filterTasksForChatSearch(tasks, "דוד")[0].title).toBe("שיחה");
  expect(filterTasksForChatSearch(tasks, "אורבן")[0].title).toBe("ליד חדש");
  expect(filterTasksForChatSearch(tasks, "מיכל")[0].title).toBe("ליד חדש");
  expect(filterTasksForChatSearch(tasks, "   ").length).toBe(3);
});

test("sortTasksForChatList puts overdue and high priority first", () => {
  const today = startOfDay(new Date("2026-09-17"));
  const sorted = sortTasksForChatList(
    [
      {
        id: "done",
        status: "done",
        priority: 10,
        due_date: "2026-09-16",
        created_at: "2026-09-01",
      },
      {
        id: "open-low",
        status: "open",
        priority: 2,
        due_date: "2026-09-20",
        created_at: "2026-09-01",
      },
      {
        id: "overdue",
        status: "open",
        priority: 3,
        due_date: "2026-09-10",
        created_at: "2026-09-01",
      },
      {
        id: "progress",
        status: "in_progress",
        priority: 5,
        due_date: "2026-09-18",
        created_at: "2026-09-01",
      },
      {
        id: "open-high",
        status: "open",
        priority: 9,
        due_date: "2026-09-21",
        created_at: "2026-09-01",
      },
    ],
    today,
  ).map((task) => task.id);
  expect(sorted).toStrictEqual([
    "overdue",
    "progress",
    "open-high",
    "open-low",
    "done",
  ]);
});
