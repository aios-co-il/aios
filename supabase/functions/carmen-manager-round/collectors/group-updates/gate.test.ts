import { assertEquals } from "jsr:@std/assert@1";
import { entry, window } from "./group-fixtures.ts";
import { gateWindow } from "./gate.ts";

const three = window([{ text: "א ב" }, { text: "ג ד" }, { text: "ה ו" }]);

Deno.test("gateWindow", async (t) => {
  await t.step("three substantive messages and no update: digest", () => {
    assertEquals(gateWindow(three, []), "digest");
  });

  await t.step("fewer than three: wait for more", () => {
    const two = window([
      { text: "א ב" },
      { text: "תודה", substantive: false },
      { text: "ג ד" },
    ]);
    assertEquals(gateWindow(two, []), "wait");
  });

  await t.step("nothing substantive: move on", () => {
    assertEquals(
      gateWindow(window([{ text: "👍", substantive: false }]), []),
      "advance",
    );
  });

  await t.step(
    "a person's entry after the first message: the card is current",
    () => {
      assertEquals(
        gateWindow(three, [entry("2026-11-01T10:30:00Z", "דיברתי עם הלקוח")]),
        "advance",
      );
      assertEquals(
        gateWindow(three, [entry("2026-11-01T09:00:00Z", "לפני")]),
        "digest",
      );
    },
  );

  await t.step(
    "an entry a person asked Carmen to write makes the card current",
    () => {
      assertEquals(
        gateWindow(three, [
          entry("2026-11-01T11:30:00Z", "עדכון", "carmen_confirmed"),
        ]),
        "advance",
      );
    },
  );

  await t.step(
    "a contact an approved group draft wrote does not make the card current",
    () => {
      const approvedCall = entry(
        "2026-11-01T11:30:00Z",
        "[כרמן · מקבוצת הוואטסאפ] שיחה עם הלקוח",
        "carmen_confirmed",
        "group_contact:120363000000000001@g.us:wa-1",
      );
      assertEquals(gateWindow(three, [approvedCall]), "digest");
    },
  );

  await t.step("entries no person wrote do not make the card current", () => {
    const automatic = [
      "group_digest",
      "system_send",
      "carmen",
      "automation",
    ].map((s) => entry("2026-11-01T11:30:00Z", "x", s));
    assertEquals(gateWindow(three, automatic), "digest");
  });
});
