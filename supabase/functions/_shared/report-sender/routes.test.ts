import { assertEquals } from "jsr:@std/assert@1";
import { REPORT_SENDER_FUNCTIONS, reportSenderFunction } from "./routes.ts";
import { REPORT_SENDER_TYPES } from "./types.ts";

Deno.test("reportSenderFunction routes each line type and payload", () => {
  assertEquals(
    reportSenderFunction("green_api", "text"),
    "send-green-api-message",
  );
  assertEquals(
    reportSenderFunction("green_api", "file"),
    "send-green-api-file",
  );
  assertEquals(
    reportSenderFunction("manus_wa", "text"),
    "send-manus-wa-message",
  );
  assertEquals(reportSenderFunction("manus_wa", "file"), "send-manus-wa-file");
  assertEquals(
    Object.keys(REPORT_SENDER_FUNCTIONS).sort(),
    [...REPORT_SENDER_TYPES].sort(),
  );
});
