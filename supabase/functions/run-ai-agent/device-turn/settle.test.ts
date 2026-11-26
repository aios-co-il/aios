import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { continueOver, REFUSED, replyOf } from "./continuation.test-fixture.ts";
import {
  actionRow,
  capturing,
  COLLEAGUE,
  CONVERSATION,
  doneRow,
  NOW,
  openOver,
  OTHER_CONVERSATION,
  panelTurn,
  tablesWith,
} from "./turn.test-fixture.ts";

Deno.test(
  "a typed message closes the conversation's steps nobody will finish",
  async (t) => {
    await t.step(
      "waiting cards are cancelled, expired ones expire, claimed ones are unknown",
      async () => {
        const waiting = actionRow({
          id: "waiting",
          conversation_id: CONVERSATION,
        });
        const lapsed = actionRow({
          id: "lapsed",
          conversation_id: CONVERSATION,
          expires_at: NOW.toISOString(),
        });
        const claimed = actionRow({
          id: "claimed",
          conversation_id: CONVERSATION,
          status: "claimed",
        });
        const done = doneRow({ id: "done" });
        const elsewhere = actionRow({
          id: "elsewhere",
          conversation_id: OTHER_CONVERSATION,
        });
        const colleagues = actionRow({
          id: "colleague",
          conversation_id: CONVERSATION,
          user_id: COLLEAGUE,
        });

        await openOver(
          tablesWith([waiting, lapsed, claimed, done, elsewhere, colleagues]),
          panelTurn(),
        );

        assertEquals(
          [waiting, lapsed, claimed, done, elsewhere, colleagues].map(
            (row) => row.status,
          ),
          [
            "cancelled",
            "expired",
            "outcome_unknown",
            "done",
            "pending",
            "pending",
          ],
        );
        assertStrictEquals(waiting.completed_at, NOW.toISOString());
      },
    );

    await t.step(
      "a closed step nobody resumed loses its page text and cannot be resumed",
      async () => {
        const done = doneRow({ id: "done" });
        const used = doneRow({
          id: "used",
          consumed_at: "2026-11-26T09:00:00.000Z",
        });
        const colleagues = doneRow({ id: "colleague", user_id: COLLEAGUE });
        const elsewhere = doneRow({
          id: "elsewhere",
          conversation_id: OTHER_CONVERSATION,
        });

        await openOver(
          tablesWith([done, used, colleagues, elsewhere]),
          panelTurn(),
        );

        assertEquals(
          [done.result, done.consumed_at, done.status],
          [null, NOW.toISOString(), "done"],
        );
        assertStrictEquals(used.consumed_at, "2026-11-26T09:00:00.000Z");
        assert(colleagues.result !== null);
        assert(elsewhere.result !== null);
      },
    );

    await t.step("a failed close is logged and the turn goes on", async () => {
      let offered: Array<unknown> = [];

      const errors = await capturing("error", async () => {
        const { turn } = await openOver(
          tablesWith([actionRow({ conversation_id: CONVERSATION })]),
          panelTurn(),
          "carmen_device_actions",
        );
        offered = turn.offeredTools;
      });

      assertStrictEquals(errors.length, 1);
      assertEquals(offered.length, 1);
    });

    await t.step("a service caller's turn touches no step", async () => {
      const waiting = actionRow({ conversation_id: CONVERSATION });

      await openOver(tablesWith([waiting]), panelTurn({ authKind: "service" }));

      assertStrictEquals(waiting.status, "pending");
    });
  },
);

Deno.test(
  "a step nobody finished is closed with a guarded update",
  async (t) => {
    await t.step("a pending step past its life becomes expired", async () => {
      const step = actionRow({
        conversation_id: CONVERSATION,
        expires_at: NOW.toISOString(),
      });
      const { turn } = await continueOver([step]);

      assertStrictEquals(turn.reply, null);
      assertStrictEquals(step.status, "expired");
      assert(turn.userTurn("").includes("status: expired"));
    });

    await t.step(
      "a claimed step past its life, also one left by a failed stop read, becomes outcome_unknown",
      async () => {
        const step = actionRow({
          conversation_id: CONVERSATION,
          status: "claimed",
          claimed_at: NOW.toISOString(),
          expires_at: NOW.toISOString(),
        });
        const { turn } = await continueOver([step]);

        assertStrictEquals(step.status, "outcome_unknown");
        assert(turn.userTurn("").includes("status: outcome_unknown"));
        assertStrictEquals(turn.userTurn("").includes("page:"), false);
      },
    );

    await t.step(
      "a claimed step still in its life is left to the panel, and the continuation refused",
      async () => {
        const step = actionRow({
          conversation_id: CONVERSATION,
          status: "claimed",
          claimed_at: NOW.toISOString(),
        });
        let reply: Response | null = null;

        await capturing("warn", async () => {
          reply = (await continueOver([step])).turn.reply;
        });

        assertEquals(await replyOf(reply), { status: 409, body: REFUSED });
        assertStrictEquals(step.status, "claimed");
      },
    );
  },
);
