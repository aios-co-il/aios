import { assertEquals } from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import { handlePostCall } from "./post-call.ts";

const CALL_ID = "11111111-2222-3333-4444-555555555555";

const payload = {
  type: "post_call_transcription",
  data: {
    conversation_id: "conv_1",
    transcript: [
      { role: "agent", message: "שלום" },
      { role: "user", message: "רציתי פגישה" },
    ],
    analysis: { transcript_summary: "הפונה ביקש פגישת היכרות." },
    metadata: { call_duration_secs: 95 },
    conversation_initiation_client_data: {
      dynamic_variables: { call_id: CALL_ID },
    },
  },
};

Deno.test(
  "the summary is sent once even when the webhook is retried",
  async () => {
    const sent: Array<string> = [];
    const { db } = fakeDb({
      carmen_phone_calls: [
        {
          id: CALL_ID,
          tenant_id: "t1",
          caller_kind: "staff",
          caller_phone: "0541112222",
          caller_name: "רון",
          client_ids: [],
          messages: [],
          started_at: "2026-11-08T08:00:00Z",
        },
      ],
      carmen_report_recipients: [
        { user_id: null, phone: "0501234567", label: null },
      ],
    });
    const send = (_t: string, _p: string, text: string) => (
      sent.push(text),
      Promise.resolve(true)
    );
    await handlePostCall(db, send, payload);
    await handlePostCall(db, send, payload);
    assertEquals(sent.length, 1);
  },
);

Deno.test("other webhook types and unknown calls are ignored", async () => {
  const sent: Array<string> = [];
  const { db, writes } = fakeDb({ carmen_phone_calls: [] });
  const send = (_t: string, _p: string, text: string) => (
    sent.push(text),
    Promise.resolve(true)
  );
  await handlePostCall(db, send, { type: "post_call_audio" });
  await handlePostCall(db, send, payload);
  assertEquals(sent.length, 0);
  assertEquals(writes.length, 0);
});
