import { assertEquals } from "jsr:@std/assert@1";
import { isDefaultMeetingName } from "./default-name.ts";

Deno.test("the bot's and Zoom's default names may be replaced", () => {
  for (const name of [
    "Zoom — כרמן",
    "Microsoft Teams — כרמן",
    "Google Meet — כרמן",
    "Zoom meeting",
    "Zoom",
    "הקלטה ידנית",
    null,
    "  ",
  ]) {
    assertEquals(isDefaultMeetingName(name), true, String(name));
  }
});

Deno.test("a name a person typed is kept", () => {
  for (const name of ["פגישה שבועית אקו", "בילבי 11.11", "אנה ודוד"]) {
    assertEquals(isDefaultMeetingName(name), false, name);
  }
});
