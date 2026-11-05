import { assertEquals } from "jsr:@std/assert@1";
import { briefTime } from "./brief-schedule.ts";

Deno.test("briefSchedule", async (t) => {
  await t.step("briefTime is the cron's time of day", () => {
    assertEquals(briefTime(), "08:00");
  });
});
