import { assertEquals } from "jsr:@std/assert@1";
import { dmRow, il, row, staffRow, thread } from "../../tests/chat-fixtures.ts";
import { needsModel, unreviewedTurns } from "./unreviewed.ts";

/** Complaint without a listed word, a quick staff reply, then thanks. */
const thanked = thread([
  staffRow({ message_id: "hi", created_at: il("08:00") }),
  row({
    message_id: "c1",
    created_at: il("14:10"),
    message_text: "הלידים שלכם זבל, שוקל לעזוב",
  }),
  staffRow({ message_id: "s1", created_at: il("14:20") }),
  row({ message_id: "c2", created_at: il("14:25"), message_text: "תודה" }),
]);

const ids = (turns: { id: string }[]) => turns.map((turn) => turn.id);

Deno.test("unreviewedTurns", async (t) => {
  await t.step("the client lines after the last one read", () => {
    assertEquals(ids(unreviewedTurns(thanked, undefined)), ["c1", "c2"]);
    assertEquals(ids(unreviewedTurns(thanked, "c1")), ["c2"]);
    assertEquals(ids(unreviewedTurns(thanked, "c2")), []);
  });

  await t.step("every client line when the one read left the read", () => {
    assertEquals(ids(unreviewedTurns(thanked, "gone")), ["c1", "c2"]);
  });
});

Deno.test("needsModel", async (t) => {
  await t.step(
    "an unread earlier streak counts even when the latest is thanks",
    () => {
      assertEquals(
        needsModel(thanked, unreviewedTurns(thanked, undefined), true),
        true,
      );
      assertEquals(
        needsModel(thanked, unreviewedTurns(thanked, "c1"), true),
        false,
      );
    },
  );

  await t.step(
    "complaint words settle a streak; the open wait still needs a request",
    () => {
      const flagged = thread([
        staffRow({ created_at: il("08:00") }),
        row({ created_at: il("09:00"), message_text: "אני לא מרוצה" }),
      ]);
      assertEquals(needsModel(flagged, flagged.pending, true), true);
      const asked = thread([
        staffRow({ created_at: il("08:00") }),
        row({ created_at: il("09:00"), message_text: "אני לא מרוצה, מתי?" }),
      ]);
      assertEquals(needsModel(asked, asked.pending, true), false);
      const answered = thread([
        staffRow({ created_at: il("08:00") }),
        row({
          message_id: "w",
          created_at: il("09:00"),
          message_text: "אני לא מרוצה",
        }),
        staffRow({ created_at: il("09:30") }),
      ]);
      assertEquals(
        needsModel(answered, unreviewedTurns(answered, undefined), true),
        false,
      );
    },
  );

  await t.step("without complaints only the open wait counts", () => {
    assertEquals(
      needsModel(thanked, unreviewedTurns(thanked, undefined), false),
      false,
    );
    const waiting = thread([
      staffRow({ created_at: il("08:00") }),
      row({ created_at: il("09:00"), message_text: "יש עדכון" }),
    ]);
    assertEquals(needsModel(waiting, waiting.pending, false), true);
  });

  await t.step("direct chats and private groups never need it", () => {
    const dm = thread([dmRow({ message_text: "הלידים זבל" })]);
    const privateGroup = thread([row({ message_text: "הלידים זבל" })]);
    assertEquals(needsModel(dm, dm.pending, true), false);
    assertEquals(needsModel(privateGroup, privateGroup.pending, true), false);
  });
});
