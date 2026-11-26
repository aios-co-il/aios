import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { DEVICE_STEPS_PER_MESSAGE } from "../../_shared/carmen/device/contract.ts";
import { resumeFromStep } from "./continuation.ts";
import { continueOver } from "./continuation.test-fixture.ts";
import {
  ACTION,
  BROKEN_ORIGINS,
  capturing,
  CONVERSATION,
  doneRow,
  fakeDb,
  ME,
  NOW,
  RUN,
  SNAPSHOT,
  tablesWith,
  TENANT,
} from "./turn.test-fixture.ts";

Deno.test("the step limit holds across continuations", async (t) => {
  /** The run's earlier steps, all done and used. */
  function earlier(count: number) {
    return Array.from({ length: count }, (_, index) =>
      doneRow({
        id: `earlier-${index}`,
        consumed_at: NOW.toISOString(),
        result: null,
      }),
    );
  }

  await t.step(
    "the twelfth step's continuation is offered no further step",
    async () => {
      const { turn } = await continueOver([
        ...earlier(DEVICE_STEPS_PER_MESSAGE - 1),
        doneRow(),
      ]);

      assertStrictEquals(turn.reply, null);
      assertEquals(turn.offeredTools, []);
    },
  );

  await t.step(
    "the eleventh step's continuation may take one more",
    async () => {
      const { turn } = await continueOver([
        ...earlier(DEVICE_STEPS_PER_MESSAGE - 2),
        doneRow(),
      ]);

      assertEquals(
        turn.offeredTools.map((tool) => tool.name),
        ["browser_read_page"],
      );
    },
  );
});

Deno.test(
  "a result the server will not hand over is refused, not shown",
  async (t) => {
    const withheld: Array<[string, Record<string, unknown>]> = [
      [
        "a reported address on the never-list (AIOS itself)",
        {
          observed_origin: "https://aios.co.il",
          observed_path: "/t/acme/clients",
          result: {
            ...SNAPSHOT,
            origin: "https://aios.co.il",
            path: "/t/acme/clients",
          },
        },
      ],
      [
        "a reported address on the never-list (the environment's own app)",
        {
          observed_origin: "https://staging.aios.co.il",
          observed_path: "/",
          result: {
            ...SNAPSHOT,
            origin: "https://staging.aios.co.il",
            path: "/",
          },
        },
      ],
      [
        "a result read elsewhere than where Chrome said the tab was",
        { observed_path: "/other" },
      ],
      [
        "a result that does not fit the tool",
        { result: { ...SNAPSHOT, extra: "x" } },
      ],
      ["no observed address", { observed_origin: null }],
    ];
    for (const [name, overrides] of withheld) {
      await t.step(name, async () => {
        const step = doneRow(overrides);
        let userTurn = "";
        let reply: Response | null = null;

        // Refused by its check, never by a crash read as a broken configuration.
        const errors = await capturing("error", async () => {
          const { turn } = await continueOver([step]);
          userTurn = turn.userTurn("");
          reply = turn.reply;
        });

        assertEquals(errors, []);
        assertStrictEquals(reply, null);
        assert(userTurn.includes("status: refused"));
        assertStrictEquals(userTurn.includes("page:"), false);
        assertStrictEquals(step.status, "refused");
        assertStrictEquals(step.decision, "never");
        assertStrictEquals(step.result, null);
      });
    }

    await t.step(
      "a contract TypeError completes the step as refused, loudly",
      async () => {
        const step = doneRow();
        let outcome: unknown;

        const errors = await capturing("error", async () => {
          outcome = await resumeFromStep(
            fakeDb(tablesWith([step])),
            {
              tenantId: TENANT,
              userId: ME,
              runId: RUN,
              conversationId: CONVERSATION,
              actionId: ACTION,
            },
            BROKEN_ORIGINS,
            NOW,
          );
        });

        assertEquals(outcome, {
          kind: "resume",
          outcome: {
            tool: "browser_read_page",
            status: "refused",
            result: null,
            tainted: false,
          },
          stepsUsed: 1,
        });
        assertStrictEquals(errors.length, 1);
        assertStrictEquals(step.status, "refused");
        assertStrictEquals(step.result, null);
      },
    );
  },
);

Deno.test(
  "a run holding page text from another origin is tainted",
  async (t) => {
    await t.step("recorded in the log and the block", async () => {
      const first = doneRow({
        id: "first",
        observed_origin: "https://other.example",
        observed_path: "/",
        consumed_at: NOW.toISOString(),
        result: null,
        created_at: "2026-11-26T09:59:00.000Z",
      });
      let userTurn = "";

      const warnings = await capturing("warn", async () => {
        const { turn } = await continueOver([
          first,
          doneRow({ created_at: NOW.toISOString() }),
        ]);
        userTurn = turn.userTurn("");
      });

      assert(userTurn.includes("more than one site"));
      assert(warnings.some((line) => line.includes(`run=${RUN} tainted`)));
    });

    await t.step("one origin is not tainted", async () => {
      const { turn } = await continueOver([doneRow()]);

      assertStrictEquals(
        turn.userTurn("").includes("more than one site"),
        false,
      );
    });
  },
);
