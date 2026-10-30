import { assertStrictEquals } from "jsr:@std/assert@1";
import { clientFollowUpNotifyAt, isFollowUpDue } from "./schedule.ts";

Deno.test(
  "follow-up reminder fires at 08:30 Israel on the follow-up date",
  () => {
    const notifyAt = clientFollowUpNotifyAt("2026-08-24");
    assertStrictEquals(notifyAt?.toISOString(), "2026-08-24T05:30:00.000Z");
  },
);

Deno.test("follow-up is due after 08:30 Israel on the follow-up date", () => {
  assertStrictEquals(
    isFollowUpDue("2026-08-24", new Date("2026-08-24T06:00:00.000Z")),
    true,
  );
  assertStrictEquals(
    isFollowUpDue("2026-08-24", new Date("2026-08-24T05:00:00.000Z")),
    false,
  );
});

Deno.test(
  "overdue follow-up is due once the original reminder time passed",
  () => {
    assertStrictEquals(
      isFollowUpDue("2026-08-20", new Date("2026-08-24T10:00:00.000Z")),
      true,
    );
  },
);
