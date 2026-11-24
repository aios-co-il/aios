import { assertEquals } from "jsr:@std/assert@1";
import { executorClient } from "./executor-client.test-fixture.ts";
import { executeJoinMeetingForClient } from "./join-meeting-for-client.ts";

Deno.test(
  "meeting SDK invocation retains errors and validates before invoking",
  async () => {
    const f = executorClient([{}], 403);
    await executeJoinMeetingForClient({ meeting_url: " " }, f.context);
    assertEquals(f.calls.length, 0);
    assertEquals(
      await executeJoinMeetingForClient(
        { meeting_url: " https://meet.google.com/test " },
        f.context,
      ),
      { error: "שגיאה בשליחת הבוט (403)" },
    );
    assertEquals(f.calls[0].body, {
      meeting_url: "https://meet.google.com/test",
      client_id: null,
      lead_id: null,
      campaigner_ids: [],
      agency_id: null,
      summary_scope: "auto",
      meeting_topic: null,
      tenant_id: "t1",
      created_by: null,
    });
  },
);
