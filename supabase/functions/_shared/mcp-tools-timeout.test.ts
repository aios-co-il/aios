import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { codingAgentDispatchTimeoutResult } from "./mcp-tools.ts";

Deno.test(
  "codingAgentDispatchTimeoutResult forbids false not-received claims",
  () => {
    const r = codingAgentDispatchTimeoutResult("Cursor", "request_dev_task");
    assertEquals(r.timeout, true);
    assertEquals(r.delivery_unconfirmed, true);
    assertEquals(r.do_not_claim_not_received, true);
    assertStringIncludes(String(r.message), "Do NOT tell David");
    assertStringIncludes(String(r.message), "didn't receive");
  },
);
