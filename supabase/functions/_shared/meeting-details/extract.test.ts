import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { extractMeetingDetails } from "./extract.ts";
import type { ClientOption } from "./plan.ts";

const CLIENTS: Array<ClientOption> = [
  { id: "c-bilbi", name: "בילבי", agency_id: "agency-1" },
];

Deno.test("the model gets the summary and the client list", async () => {
  let sent = "";
  function fakeFetch(
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    sent = String(init?.body ?? "");
    return Promise.resolve(
      Response.json({
        choices: [
          {
            message: {
              content:
                'הנה: {"title": "בילבי — סקירת ביצועים", "client_id": "c-bilbi"}',
            },
          },
        ],
      }),
    );
  }
  const details = await extractMeetingDetails(
    "## תקציר מנהלים\nפגישה עם בילבי על הקמפיין",
    CLIENTS,
    { openRouterKey: "or-key" },
    fakeFetch,
  );
  assertEquals(details, {
    title: "בילבי — סקירת ביצועים",
    clientId: "c-bilbi",
  });
  assertStringIncludes(sent, "c-bilbi | בילבי");
  assertStringIncludes(sent, "פגישה עם בילבי על הקמפיין");
});
