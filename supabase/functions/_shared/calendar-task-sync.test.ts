import { assertEquals } from "jsr:@std/assert@1";
import { calendarEventCancelledTaskUpdates } from "./calendar-task-sync.ts";

Deno.test(
  "cancelled calendar event marks linked task done and clears event id",
  () => {
    assertEquals(calendarEventCancelledTaskUpdates(), {
      status: "done",
      google_calendar_event_id: null,
    });
  },
);
