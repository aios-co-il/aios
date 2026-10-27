import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";

Deno.test("agent-heartbeat index", async (t) => {
  await t.step("sends no WhatsApp and uses the Israel hour", async () => {
    const heartbeat = await Deno.readTextFile(
      new URL("./index.ts", import.meta.url),
    );
    assertNotMatch(heartbeat, /send-green-api-message|send-manus-wa-message/);
    assertNotMatch(heartbeat, /daily_digest_sent/);
    assertNotMatch(heartbeat, /getUTCHours\(\)\s*\+\s*3/);
    assertMatch(heartbeat, /jerusalemHour\(now\)/);
    // Overdue cutoff and summary date are Israel dates, not UTC ones.
    assertNotMatch(heartbeat, /toISOString\(\)\.split\("T"\)/);
    assertMatch(heartbeat, /\.lt\("due_date", jerusalemYmd\(now\)\)/);
    // task_updates has no tenant_id and user_id is a profiles uuid.
    assertNotMatch(heartbeat, /user_id:\s*"system"/);
  });
});
