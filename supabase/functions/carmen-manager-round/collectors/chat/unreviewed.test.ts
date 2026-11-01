import { assertEquals } from "jsr:@std/assert@1";
import {
  dmRow,
  il,
  receiptRows,
  row,
  staffRow,
  thread,
} from "../../tests/chat-fixtures.ts";
import { needsModel, readCoversWait, unreviewedTurns } from "./unreviewed.ts";

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

/** Requests and complaints are read; requests only. No finding is open. */
const ALL = { complaints: true, waitRaised: false };
const REQUESTS = { complaints: false, waitRaised: false };

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
        needsModel(thanked, unreviewedTurns(thanked, undefined), ALL),
        true,
      );
      assertEquals(
        needsModel(thanked, unreviewedTurns(thanked, "c1"), ALL),
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
      assertEquals(needsModel(flagged, flagged.pending, ALL), true);
      const asked = thread([
        staffRow({ created_at: il("08:00") }),
        row({ created_at: il("09:00"), message_text: "אני לא מרוצה, מתי?" }),
      ]);
      assertEquals(needsModel(asked, asked.pending, ALL), false);
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
        needsModel(answered, unreviewedTurns(answered, undefined), ALL),
        false,
      );
    },
  );

  await t.step("without complaints only the open wait counts", () => {
    assertEquals(
      needsModel(thanked, unreviewedTurns(thanked, undefined), REQUESTS),
      false,
    );
    const waiting = thread([
      staffRow({ created_at: il("08:00") }),
      row({ created_at: il("09:00"), message_text: "יש עדכון" }),
    ]);
    assertEquals(needsModel(waiting, waiting.pending, REQUESTS), true);
  });

  await t.step("direct chats and private groups never need it", () => {
    const dm = thread([dmRow({ message_text: "הלידים זבל" })]);
    const privateGroup = thread([row({ message_text: "הלידים זבל" })]);
    assertEquals(needsModel(dm, dm.pending, ALL), false);
    assertEquals(needsModel(privateGroup, privateGroup.pending, ALL), false);
  });
});

Deno.test("readCoversWait", async (t) => {
  const asked = [
    staffRow({ message_id: "hi", created_at: il("08:00") }),
    row({
      message_id: "c1",
      created_at: il("09:00"),
      message_text: "הדוח של החודש עוד לא הגיע",
    }),
    row({ message_id: "c2", created_at: il("09:10"), message_text: "🙏 תודה" }),
  ];
  const wait = thread(asked);

  await t.step("a read of the wait followed only by thanks covers it", () => {
    assertEquals(readCoversWait(wait, "c1", false), true);
    assertEquals(readCoversWait(wait, "c2", false), true);
    assertEquals(
      needsModel(wait, unreviewedTurns(wait, "c1"), ALL),
      false,
      "and the thanks are not asked about",
    );
  });

  await t.step(
    "a new line after the read, or a read before the wait, does not",
    () => {
      const more = thread([
        ...asked,
        row({
          message_id: "c3",
          created_at: il("09:20"),
          message_text: "ועוד",
        }),
      ]);
      assertEquals(readCoversWait(more, "c1", false), false);
      assertEquals(readCoversWait(thanked, "c1", false), false);
      assertEquals(readCoversWait(wait, "gone", false), false);
    },
  );

  const receipt = thread(receiptRows());

  await t.step(
    "a receipt ('קיבלתי') after the read does not, so the wait is read again",
    () => {
      assertEquals(readCoversWait(receipt, "c1", false), false);
      for (const complaints of [true, false]) {
        const scope = { complaints, waitRaised: false };
        assertEquals(
          needsModel(receipt, unreviewedTurns(receipt, "c1"), scope),
          true,
        );
      }
    },
  );

  await t.step(
    "once the wait's finding is raised a receipt is not read, and the read still covers it",
    () => {
      assertEquals(readCoversWait(receipt, "c1", true), true);
      for (const complaints of [true, false]) {
        const scope = { complaints, waitRaised: true };
        assertEquals(
          needsModel(receipt, unreviewedTurns(receipt, "c1"), scope),
          false,
        );
      }
    },
  );

  await t.step("a wait that is only a receipt is not asked about", () => {
    const only = thread([
      staffRow({ message_id: "hi", created_at: il("08:00") }),
      row({
        message_id: "c1",
        created_at: il("09:00"),
        message_text: "קיבלתי, תודה",
      }),
    ]);
    assertEquals(needsModel(only, only.pending, ALL), false);
  });
});
