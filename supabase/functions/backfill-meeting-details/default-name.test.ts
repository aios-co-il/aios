import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { isDefaultMeetingName } from "./default-name.ts";

describe("isDefaultMeetingName", () => {
  it("accepts the meeting bot's name for every platform", () => {
    for (const name of [
      "Zoom — כרמן",
      "Microsoft Teams — כרמן",
      "Google Meet — כרמן",
      "פגישה — כרמן",
    ]) {
      assertEquals(isDefaultMeetingName(name), true, name);
    }
  });

  it("accepts the manual upload name and older Zoom import names", () => {
    for (const name of ["הקלטה ידנית", "Zoom meeting", "Zoom"]) {
      assertEquals(isDefaultMeetingName(name), true, name);
    }
  });

  it("accepts an empty or blank name", () => {
    for (const name of [null, "", "  "]) {
      assertEquals(isDefaultMeetingName(name), true, String(name));
    }
  });

  it("accepts the browser extension's dated name", () => {
    for (const name of [
      "הקלטת פגישה 13.11.2026",
      "הקלטת פגישה 3.1.2026",
      " הקלטת פגישה 13/11/2026 ",
    ]) {
      assertEquals(isDefaultMeetingName(name), true, name);
    }
  });

  it("keeps a name a person typed, even one close to a default", () => {
    for (const name of [
      "פגישה שבועית אקו",
      "בילבי 11.11",
      "אנה ודוד",
      "הקלטת פגישה עם בילבי",
      "הקלטת פגישה 13.11.2026 בילבי",
      "Zoom — כרמן עם בילבי",
    ]) {
      assertEquals(isDefaultMeetingName(name), false, name);
    }
  });
});
