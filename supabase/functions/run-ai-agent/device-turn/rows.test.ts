import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { consumeStep } from "./rows.ts";
import { closeStep, readOpenSteps } from "./settle.ts";
import {
  actionRow,
  COLLEAGUE,
  CONVERSATION,
  doneRow,
  fakeDb,
  ME,
  NOW,
  tablesWith,
  TENANT,
} from "./turn.test-fixture.ts";

const OWNER = { tenantId: TENANT, userId: ME };

Deno.test("every write names the state it leaves", async (t) => {
  await t.step("a step is used once", async () => {
    const step = doneRow();
    const db = fakeDb(tablesWith([step]));

    assertStrictEquals(
      await consumeStep(
        db,
        OWNER,
        { id: String(step.id), status: "done" },
        false,
        NOW,
      ),
      true,
    );
    assertStrictEquals(
      await consumeStep(
        db,
        OWNER,
        { id: String(step.id), status: "done" },
        false,
        NOW,
      ),
      false,
    );
    assertStrictEquals(step.result, null);
  });

  await t.step("a step whose state moved is not used", async () => {
    const step = doneRow({ status: "refused" });

    const used = await consumeStep(
      fakeDb(tablesWith([step])),
      OWNER,
      { id: String(step.id), status: "done" },
      false,
      NOW,
    );

    assertStrictEquals(used, false);
    assertStrictEquals(step.consumed_at, undefined);
  });

  await t.step(
    "a step the panel completed meanwhile is not closed over",
    async () => {
      const step = doneRow();

      const closed = await closeStep(
        fakeDb(tablesWith([step])),
        OWNER,
        String(step.id),
        { from: "claimed", to: "outcome_unknown" },
        NOW,
      );

      assertStrictEquals(closed, false);
      assertStrictEquals(step.status, "done");
    },
  );

  await t.step("a step that has not expired is not expired", async () => {
    const step = actionRow();

    const closed = await closeStep(
      fakeDb(tablesWith([step])),
      OWNER,
      String(step.id),
      { from: "pending", to: "expired", expiredBy: NOW },
      NOW,
    );

    assertStrictEquals(closed, false);
    assertStrictEquals(step.status, "pending");
  });

  await t.step("another user's step is neither closed nor used", async () => {
    const step = doneRow({ user_id: COLLEAGUE });
    const db = fakeDb(tablesWith([step]));

    assertStrictEquals(
      await consumeStep(
        db,
        OWNER,
        { id: String(step.id), status: "done" },
        false,
        NOW,
      ),
      false,
    );
    assertStrictEquals(
      await closeStep(
        db,
        OWNER,
        String(step.id),
        { from: "done", to: "cancelled" },
        NOW,
      ),
      false,
    );
  });
});

Deno.test(
  "the open steps read are the owner's, in this conversation",
  async () => {
    const mine = actionRow({ id: "mine", conversation_id: CONVERSATION });
    const colleagues = actionRow({
      id: "colleague",
      conversation_id: CONVERSATION,
      user_id: COLLEAGUE,
    });

    const open = await readOpenSteps(
      fakeDb(tablesWith([mine, colleagues, doneRow({ id: "done" })])),
      {
        ...OWNER,
        conversationId: CONVERSATION,
      },
    );

    assertEquals(
      open.map((step) => step.id),
      ["mine"],
    );
  },
);
