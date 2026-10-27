import { assertEquals } from "jsr:@std/assert@1";
import { il, row, staffRow, thread } from "../../tests/chat-fixtures.ts";
import { clientStreaks, latestClientTurn } from "./streaks.ts";

Deno.test("clientStreaks", async (t) => {
  await t.step("client turns between staff turns, oldest first", () => {
    const built = thread([
      row({ message_id: "a", created_at: il("09:00") }),
      row({ message_id: "b", created_at: il("09:01") }),
      staffRow({ message_id: "s", created_at: il("09:30") }),
      row({ message_id: "c", created_at: il("10:00") }),
    ]);
    assertEquals(
      clientStreaks(built).map((streak) => [
        streak.turns.map((turn) => turn.id),
        streak.anchored,
      ]),
      [
        [["a", "b"], false],
        [["c"], true],
      ],
    );
    assertEquals(latestClientTurn(built)?.id, "c");
  });

  await t.step("a thread staff spoke last still has its client streaks", () => {
    const built = thread([
      row({ message_id: "a", created_at: il("09:00") }),
      row({ direction: "outbound", created_at: il("09:05") }),
    ]);
    assertEquals(clientStreaks(built).length, 1);
    assertEquals(latestClientTurn(built)?.id, "a");
  });
});
