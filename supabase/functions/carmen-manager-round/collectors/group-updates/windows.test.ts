import { assertEquals } from "jsr:@std/assert@1";
import { history, message, STAFF_KEY } from "../../tests/group-fixtures.ts";
import { groupWindows } from "./windows.ts";

const from = new Date("2026-11-01T00:00:00Z");
const staff = new Set([STAFF_KEY]);
const messages = [
  message("a", "2026-10-31T23:00:00Z", "לפני הרצפה"),
  message("b", "2026-11-01T09:00:00Z", "מתי עולה הקמפיין?"),
  message("c", "2026-11-01T09:05:00Z", "עולה מחר בבוקר", { key: STAFF_KEY }),
  message("d", "2026-11-01T09:10:00Z", "שלחתי מהמערכת", {
    out: true,
    key: null,
  }),
  message("e", "2026-11-01T09:15:00Z", "[תמונה]", { key: null }),
];

Deno.test("groupWindows", async (t) => {
  await t.step(
    "starts after the floor and labels speakers without phones",
    () => {
      const [w] = groupWindows(
        [history(messages)],
        { floor: "", groups: {} },
        from,
        staff,
      );
      assertEquals(
        w.messages.map((m) => [m.id, m.speaker, m.substantive]),
        [
          ["b", "client", true],
          ["c", "staff", true],
          ["d", "staff", true],
          ["e", "unknown", false],
        ],
      );
      assertEquals(w.last, { at: "2026-11-01T09:15:00Z", id: "e" });
    },
  );

  await t.step(
    "an @lid sender with no known phone is unknown, never the client",
    () => {
      const [w] = groupWindows(
        [
          history([
            message("l", "2026-11-01T09:00:00Z", "הלקוח אישר את הבאנר", {
              key: null,
              lidUnmapped: true,
            }),
          ]),
        ],
        { floor: "", groups: {} },
        from,
        staff,
      );
      assertEquals(w.messages[0].speaker, "unknown");
    },
  );

  await t.step("starts after the group's watermark, ties broken by id", () => {
    const marks = {
      [history([]).group_id]: { at: "2026-11-01T09:05:00Z", id: "c" },
    };
    const [w] = groupWindows(
      [
        history([
          ...messages,
          message("cc", "2026-11-01T09:05:00Z", "באותה שנייה"),
        ]),
      ],
      { floor: "", groups: marks },
      from,
      staff,
    );
    assertEquals(
      w.messages.map((m) => m.id),
      ["d", "e", "cc"],
    );
  });

  await t.step("a group with nothing new has no window", () => {
    const marks = {
      [history([]).group_id]: { at: "2026-11-01T09:15:00Z", id: "e" },
    };
    assertEquals(
      groupWindows(
        [history(messages)],
        { floor: "", groups: marks },
        from,
        staff,
      ),
      [],
    );
  });
});
