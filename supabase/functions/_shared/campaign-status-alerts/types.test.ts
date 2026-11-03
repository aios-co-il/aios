import { assertEquals } from "jsr:@std/assert@1";

import { NOTIFY_ALERT_TYPES, STATUS_ALERT_TYPES } from "./types.ts";

Deno.test("no status alert sends a WhatsApp; all stay on the dashboard", () => {
  assertEquals(
    STATUS_ALERT_TYPES.filter((type) => NOTIFY_ALERT_TYPES.has(type)),
    [],
  );
});
