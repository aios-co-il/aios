import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { bucketOf, SHOT_PATH, shotRow } from "./screenshot.test-fixture.ts";
import { openDeviceTurn } from "./turn.ts";
import {
  capturing,
  CONVERSATION,
  doneRow,
  fakeDb,
  openOver,
  panelTurn,
  tablesWith,
} from "./turn.test-fixture.ts";

/** Opens a typed message over these steps with a recording bucket. */
async function typedOver(steps: Array<Record<string, unknown>>) {
  const bucket = bucketOf();
  await openOver(
    tablesWith(steps),
    panelTurn({ screenshotStore: bucket.store }),
  );
  return { bucket };
}

Deno.test(
  "a screenshot nobody resumed is deleted by the next typed message",
  async (t) => {
    await t.step("its file goes before its row loses the path", async () => {
      const unused = shotRow(undefined, SHOT_PATH, { consumed_at: null });
      const { bucket } = await typedOver([unused]);

      assertEquals(bucket.removed, [SHOT_PATH]);
      assertStrictEquals(unused.result, null);
    });

    await t.step("another conversation's picture is left alone", async () => {
      const elsewhere = shotRow(undefined, SHOT_PATH, {
        conversation_id: crypto.randomUUID(),
      });
      const { bucket } = await typedOver([elsewhere]);

      assertEquals(bucket.removed, []);
      assertEquals(elsewhere.conversation_id === CONVERSATION, false);
    });

    await t.step(
      "an unreadable list of pictures is logged, and the conversation's page text is still cleared",
      async () => {
        const read = doneRow({ consumed_at: null });
        // Only the query that lists the conversation's pictures fails.
        const db = fakeDb(
          tablesWith([read]),
          undefined,
          (_table, equals) => equals.tool === "browser_screenshot",
        );

        const errors = await capturing("error", () =>
          openDeviceTurn(db, undefined, panelTurn()),
        );

        assert(errors.some((line) => line.includes("unused screenshots")));
        assertStrictEquals(read.result, null);
        assert(read.consumed_at);
      },
    );

    await t.step(
      "a failed delete is logged without the path and the turn goes on",
      async () => {
        const errors = await capturing("error", async () => {
          const bucket = bucketOf();
          bucket.store.remove = () => Promise.reject(new Error("boom"));
          await openOver(
            tablesWith([shotRow(undefined, SHOT_PATH, { consumed_at: null })]),
            panelTurn({ screenshotStore: bucket.store }),
          );
        });

        assertEquals(errors.length, 1);
        assertStrictEquals(errors[0].includes(SHOT_PATH), false);
      },
    );
  },
);
