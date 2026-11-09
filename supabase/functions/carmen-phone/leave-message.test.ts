import { assertEquals } from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import { leaveMessage } from "./leave-message.ts";

const CALL_ID = "11111111-2222-3333-4444-555555555555";

const call = (kind: string) => ({
  id: CALL_ID,
  tenant_id: "t1",
  caller_kind: kind,
  caller_phone: "0529998888",
  caller_name: null,
  client_ids: kind === "client" ? ["cl1"] : [],
  messages: [],
  started_at: "2026-11-08T08:00:00Z",
});

/** Runs the tool and collects the WhatsApps it sent. */
async function run(
  tables: Record<string, Array<Record<string, unknown>>>,
  args: Record<string, unknown>,
) {
  const sent: Array<string> = [];
  const { db, writes } = fakeDb(tables);
  const result = await leaveMessage(
    db,
    (_t, phone, text) => (
      sent.push(`${phone}: ${text}`),
      Promise.resolve(true)
    ),
    args,
  );
  return { result, sent, writes };
}

Deno.test(
  "an unknown caller's message reaches the team and is stored",
  async () => {
    const { result, writes } = await run(
      { carmen_phone_calls: [call("unknown")], carmen_caller_policies: [] },
      { call_id: CALL_ID, message: "מעוניין בפגישה", caller_name: "יוסי" },
    );
    assertEquals(result.ok, true);
    assertEquals(
      writes.some((w) => w.table === "carmen_phone_calls" && w.op === "update"),
      true,
    );
  },
);

Deno.test(
  "an org that turned messages and meetings off refuses the message",
  async () => {
    const { result, writes } = await run(
      {
        carmen_phone_calls: [call("client")],
        carmen_caller_policies: [
          {
            caller_kind: "client",
            instructions: "",
            allowed_topics: [],
            forbidden_topics: [],
            may_take_message: false,
            may_book_meeting: false,
          },
        ],
      },
      { call_id: CALL_ID, message: "תשנו לי את הקמפיין" },
    );
    assertEquals(result.ok, false);
    assertEquals(writes.length, 0);
  },
);

Deno.test("a made-up call id or an empty message is refused", async () => {
  const tables = { carmen_phone_calls: [call("staff")] };
  assertEquals(
    (await run(tables, { call_id: "nope", message: "x" })).result.ok,
    false,
  );
  assertEquals(
    (await run(tables, { call_id: CALL_ID, message: "  " })).result.ok,
    false,
  );
});

const RECIPIENTS = [{ user_id: null, phone: "0501234567", label: null }];

Deno.test(
  "a 4th message in one call is refused and sends nothing",
  async () => {
    const taken = [1, 2, 3].map((n) => ({ message: `הודעה ${n}` }));
    const { result, sent, writes } = await run(
      {
        carmen_phone_calls: [{ ...call("unknown"), messages: taken }],
        carmen_caller_policies: [],
        carmen_report_recipients: RECIPIENTS,
      },
      { call_id: CALL_ID, message: "עוד הודעה" },
    );
    assertEquals(result.ok, false);
    assertEquals(result.result.includes("כבר נרשמה"), true);
    assertEquals(sent.length, 0);
    assertEquals(writes.length, 0);
  },
);

Deno.test(
  "a call over the hourly limit takes no messages, even from the team",
  async () => {
    const { result, sent, writes } = await run(
      {
        carmen_phone_calls: [{ ...call("staff"), rate_limited: true }],
        carmen_report_recipients: RECIPIENTS,
      },
      { call_id: CALL_ID, message: "תחזרו אליי" },
    );
    assertEquals(result.ok, false);
    assertEquals(sent.length, 0);
    assertEquals(writes.length, 0);
  },
);

Deno.test(
  "a message neither stored nor delivered is reported as not recorded",
  async () => {
    const { db } = fakeDb(
      {
        carmen_phone_calls: [call("unknown")],
        carmen_caller_policies: [],
        carmen_report_recipients: RECIPIENTS,
      },
      ["carmen_phone_calls.update"],
    );
    const result = await leaveMessage(db, () => Promise.resolve(false), {
      call_id: CALL_ID,
      message: "מעוניין בפגישה",
    });
    assertEquals(result.ok, false);
    assertEquals(result.result.includes("לא הצלחתי לרשום"), true);
  },
);
