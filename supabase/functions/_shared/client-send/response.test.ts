import { assertEquals } from "jsr:@std/assert@1";
import { corsHeaders } from "../cors.ts";
import { clientSendRefusedResponse } from "./response.ts";

Deno.test(
  "clientSendRefusedResponse is a 403 naming only the rule",
  async () => {
    const response = clientSendRefusedResponse(
      {
        allowed: false,
        reason: "staff_only",
        recipient: {
          kind: "client",
          clientIds: ["client-1"],
          leadId: null,
          groupId: null,
          ambiguous: false,
        },
      },
      corsHeaders,
    );
    assertEquals(response.status, 403);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(await response.json(), {
      error: "client_send_not_authorized",
      reason: "staff_only",
    });
  },
);
