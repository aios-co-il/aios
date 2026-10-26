import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  taskNotificationScope,
  taskNotificationsHeldUntil,
  taskOverdueNotifyAt,
  taskReminderAt,
} from "./schedule.ts";

const israelDate = (date: Date | null) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(
    date!,
  );

Deno.test(
  "overdue task is notified at 08:30 Israel on the day after due date",
  () => {
    const overdueAt = taskOverdueNotifyAt({
      due_date: "2026-08-03",
    });
    assertStrictEquals(overdueAt?.toISOString(), "2026-08-04T05:30:00.000Z");
  },
);

Deno.test(
  "high priority daytime task is reminded exactly five hours later",
  () => {
    const reminder = taskReminderAt({
      priority: 10,
      created_at: "2026-07-28T07:00:00.000Z", // 10:00 Israel
      due_date: null,
      due_time: null,
    });
    assertStrictEquals(reminder?.toISOString(), "2026-07-28T12:00:00.000Z");
  },
);

Deno.test(
  "high priority evening task waits until 08:30 the next morning",
  () => {
    const reminder = taskReminderAt({
      priority: 9,
      created_at: "2026-07-28T16:00:00.000Z", // 19:00 Israel; +5h is midnight
      due_date: null,
      due_time: null,
    });
    assertStrictEquals(reminder?.toISOString(), "2026-07-29T05:30:00.000Z");
  },
);

Deno.test(
  "normal priority task is reminded one day before its due time",
  () => {
    const reminder = taskReminderAt({
      priority: 5,
      created_at: "2026-07-20T07:00:00.000Z",
      due_date: "2026-07-30",
      due_time: "14:00:00",
    });
    assertStrictEquals(reminder?.toISOString(), "2026-07-29T11:00:00.000Z");
  },
);

Deno.test(
  "night due time is reminded at 19:00 on the previous calendar day",
  () => {
    const reminder = taskReminderAt({
      priority: 3,
      created_at: "2026-07-20T07:00:00.000Z",
      due_date: "2026-07-30",
      due_time: "02:00:00",
    });
    assertStrictEquals(reminder?.toISOString(), "2026-07-29T16:00:00.000Z");
  },
);

Deno.test(
  "manager assignment to another campaigner enables managed notifications",
  () => {
    assertEquals(
      taskNotificationScope({
        taskCampaignerId: "campaigner-b",
        taskSalesPersonId: null,
        creatorCampaignerId: "manager-a",
        creatorSalesPersonId: null,
        creatorRoles: ["team_manager"],
        hasCreator: true,
      }),
      {
        isSelfAssigned: false,
        shouldNotifyAssignee: true,
        isManagedAssignment: true,
      },
    );
  },
);

Deno.test(
  "campaigner self-assignment is silent unless a self reminder is requested",
  () => {
    assertEquals(
      taskNotificationScope({
        taskCampaignerId: "campaigner-a",
        taskSalesPersonId: null,
        creatorCampaignerId: "campaigner-a",
        creatorSalesPersonId: null,
        creatorRoles: ["campaigner"],
        hasCreator: true,
      }),
      {
        isSelfAssigned: true,
        shouldNotifyAssignee: false,
        isManagedAssignment: false,
      },
    );
  },
);

Deno.test(
  "campaigner assignment to a colleague notifies the assignee without managerial follow-ups",
  () => {
    assertEquals(
      taskNotificationScope({
        taskCampaignerId: "campaigner-b",
        taskSalesPersonId: null,
        creatorCampaignerId: "campaigner-a",
        creatorSalesPersonId: null,
        creatorRoles: ["campaigner"],
        hasCreator: true,
      }),
      {
        isSelfAssigned: false,
        shouldNotifyAssignee: true,
        isManagedAssignment: false,
      },
    );
  },
);

Deno.test("service-created task without a known giver is silent", () => {
  assertEquals(
    taskNotificationScope({
      taskCampaignerId: "campaigner-b",
      taskSalesPersonId: null,
      creatorCampaignerId: null,
      creatorSalesPersonId: null,
      creatorRoles: [],
      hasCreator: false,
    }),
    {
      isSelfAssigned: false,
      shouldNotifyAssignee: false,
      isManagedAssignment: false,
    },
  );
});

Deno.test("sales person receives a peer-assignment notification", () => {
  assertEquals(
    taskNotificationScope({
      taskCampaignerId: null,
      taskSalesPersonId: "sales-b",
      creatorCampaignerId: "campaigner-a",
      creatorSalesPersonId: null,
      creatorRoles: ["campaigner"],
      hasCreator: true,
    }),
    {
      isSelfAssigned: false,
      shouldNotifyAssignee: true,
      isManagedAssignment: false,
    },
  );
});

// AIO-226 regression: a recurring occurrence is generated (and the worker
// invoked) when the previous one is marked done, so the one-off "day before"
// rule fired its reminder on the day BEFORE the task's own day.
Deno.test(
  "recurring task reminder goes out on the task's own Israel date, not the day before",
  () => {
    const reminder = taskReminderAt({
      priority: 5,
      created_at: "2026-10-26T15:00:00.000Z", // Monday's occurrence marked done
      due_date: "2026-10-27",
      due_time: "14:00:00",
      recurrence_frequency: "daily",
    });
    assertStrictEquals(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(
        reminder!,
      ),
      "2026-10-27",
    );
    assertStrictEquals(reminder?.toISOString(), "2026-10-27T06:30:00.000Z"); // 08:30 IST
  },
);

Deno.test(
  "recurring reminder around midnight lands on the due date at 08:30, not 00:00",
  () => {
    const reminder = taskReminderAt({
      priority: 5,
      created_at: "2026-10-26T21:50:00.000Z", // 23:50 Israel on the 26th
      due_date: "2026-10-27",
      due_time: null,
      recurrence_frequency: "daily",
    });
    // 22:30Z on the 26th is already the 27th in Israel, but still before 08:30.
    assert(reminder!.getTime() > Date.parse("2026-10-26T22:30:00.000Z"));
    assertStrictEquals(israelDate(reminder), "2026-10-27");
    assertStrictEquals(reminder?.toISOString(), "2026-10-27T06:30:00.000Z");
  },
);

Deno.test(
  "recurring reminder stays on its Israel date across the 25.10 DST change",
  () => {
    const at = (due_date: string) =>
      taskReminderAt({
        priority: 5,
        created_at: "2026-10-20T07:00:00.000Z",
        due_date,
        due_time: "10:00:00",
        recurrence_frequency: "weekly",
      })?.toISOString();
    assertStrictEquals(at("2026-10-22"), "2026-10-22T05:30:00.000Z"); // IDT, UTC+3
    assertStrictEquals(at("2026-10-25"), "2026-10-25T06:30:00.000Z"); // IST after 02:00
    assertStrictEquals(at("2026-10-26"), "2026-10-26T06:30:00.000Z");
    assertStrictEquals(at("2027-03-26"), "2027-03-26T05:30:00.000Z"); // DST starts that night
  },
);

Deno.test(
  "urgent recurring occurrence is not reminded before its own day",
  () => {
    const reminder = taskReminderAt({
      priority: 9,
      created_at: "2026-10-26T08:00:00.000Z", // previous occurrence done at 10:00
      due_date: "2026-10-27",
      due_time: null,
      recurrence_previous_task_id: "previous-occurrence",
    });
    assertStrictEquals(reminder?.toISOString(), "2026-10-27T06:30:00.000Z");
  },
);

Deno.test(
  "recurring task due on Saturday is reminded on Friday morning",
  () => {
    const reminder = taskReminderAt({
      priority: 5,
      created_at: "2026-10-24T09:00:00.000Z",
      due_date: "2026-10-31",
      due_time: "11:00:00",
      recurrence_frequency: "weekly",
    });
    assertStrictEquals(reminder?.toISOString(), "2026-10-30T06:30:00.000Z");
  },
);

Deno.test(
  "one-off reminder that would fall on Saturday waits for Sunday 08:30",
  () => {
    const reminder = taskReminderAt({
      priority: 5,
      created_at: "2026-10-20T07:00:00.000Z",
      due_date: "2026-11-01", // Sunday 10:00, so the day-before slot is Saturday
      due_time: "10:00:00",
    });
    assertStrictEquals(reminder?.toISOString(), "2026-11-01T06:30:00.000Z");
    const urgent = taskReminderAt({
      priority: 9,
      created_at: "2026-10-30T16:00:00.000Z", // Friday 18:00 +5h = 23:00
      due_date: null,
      due_time: null,
    });
    assertStrictEquals(urgent?.toISOString(), "2026-11-01T06:30:00.000Z");
  },
);

Deno.test("overdue notice for a Friday task waits for Sunday 08:30", () => {
  assertStrictEquals(
    taskOverdueNotifyAt({ due_date: "2026-10-30" })?.toISOString(),
    "2026-11-01T06:30:00.000Z",
  );
});

Deno.test(
  "task notifications are held from Saturday 00:00 until Sunday 08:30 Israel",
  () => {
    const sunday0830 = "2026-11-01T06:30:00.000Z";
    assertStrictEquals(
      taskNotificationsHeldUntil(new Date("2026-10-30T21:59:00Z")),
      null,
    ); // Fri 23:59
    assertStrictEquals(
      taskNotificationsHeldUntil(
        new Date("2026-10-30T22:00:00Z"),
      )?.toISOString(), // Sat 00:00
      sunday0830,
    );
    assertStrictEquals(
      taskNotificationsHeldUntil(
        new Date("2026-10-31T21:59:00Z"),
      )?.toISOString(), // Sat 23:59
      sunday0830,
    );
    assertStrictEquals(
      taskNotificationsHeldUntil(
        new Date("2026-11-01T06:29:00Z"),
      )?.toISOString(), // Sun 08:29
      sunday0830,
    );
    // Sunday 08:30: the worker's next minute run delivers what was held.
    assertStrictEquals(taskNotificationsHeldUntil(new Date(sunday0830)), null);
    assertStrictEquals(
      taskNotificationsHeldUntil(new Date("2026-11-02T03:00:00Z")),
      null,
    ); // Mon 05:00
  },
);
