import { assertEquals } from "jsr:@std/assert@1";
import { meetingBotName } from "./bot-name.ts";

Deno.test("the meeting bot joins under the assistant's name", () => {
  assertEquals(meetingBotName("מיני מי"), "מיני מי · מתמלל ומסכם");
  assertEquals(meetingBotName("כרמן"), "כרמן · מתמלל ומסכם");
});
