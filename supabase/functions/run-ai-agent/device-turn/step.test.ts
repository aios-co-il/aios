import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  DEVICE_CARD_LIFE_MS,
  DEVICE_STEPS_PER_MESSAGE,
} from "../../_shared/carmen/device/contract.ts";
import { startDeviceStep, type StepTurn } from "./step.ts";
import { deviceActionOf } from "./turn.ts";
import {
  actionRow,
  BROKEN_ORIGINS,
  capturing,
  CONVERSATION,
  fakeDb,
  ME,
  NOW,
  openOver,
  ORIGINS,
  PAGE,
  panelTurn,
  RUN,
  tablesWith,
  TENANT,
} from "./turn.test-fixture.ts";

Deno.test(
  "a browser read call writes one step and ends the turn",
  async (t) => {
    await t.step(
      "one pending row: owner, org, run, conversation, tool, arguments and life",
      async () => {
        const tables = tablesWith([]);
        const { turn } = await openOver(tables, panelTurn());

        const result = await turn.call("browser_read_page", {});
        const rows = tables.carmen_device_actions;

        assertStrictEquals(rows.length, 1);
        const { id, ...row } = rows[0];
        assertEquals(row, {
          tenant_id: TENANT,
          user_id: ME,
          run_id: RUN,
          conversation_id: CONVERSATION,
          tool: "browser_read_page",
          arguments: {},
          status: "pending",
          expires_at: new Date(
            NOW.getTime() + DEVICE_CARD_LIFE_MS,
          ).toISOString(),
        });
        assertEquals(deviceActionOf(result), {
          action_id: String(id),
          tool: "browser_read_page",
        });
      },
    );

    await t.step(
      "the reply carries the id and tool, nothing else of the row",
      async () => {
        const { turn } = await openOver(tablesWith([]), panelTurn());

        const result = await turn.call("browser_read_page", {});

        assertEquals(Object.keys(deviceActionOf(result) ?? {}).sort(), [
          "action_id",
          "tool",
        ]);
      },
    );
  },
);

Deno.test("a device call that fails a check writes no row", async (t) => {
  /** The call's result and the rows after it, on a fresh turn opened with `input`. */
  async function refusedCall(
    input = panelTurn(),
    args: unknown = {},
    tool = "browser_read_page",
    steps = tablesWith([]),
  ) {
    const { turn } = await openOver(steps, input);
    const result = await turn.call(tool, args);

    assertStrictEquals(deviceActionOf(result), null);
    return { result, rows: steps.carmen_device_actions };
  }

  await t.step("a tool the turn was not offered", async () => {
    const { rows } = await refusedCall(
      panelTurn({}, { device: { tools: [] } }),
    );
    assertStrictEquals(rows.length, 0);

    const act = await refusedCall(
      panelTurn(),
      { snapshot_id: "s", ref: "e" },
      "browser_click",
    );
    assertEquals(act.rows.length, 0);
  });

  await t.step(
    "a turn that may not hold a step (a service caller)",
    async () => {
      const { rows } = await refusedCall(panelTurn({ authKind: "service" }));
      assertStrictEquals(rows.length, 0);
    },
  );

  for (const args of [{ url: "https://evil.example" }, [], null, "x"]) {
    await t.step(`malformed arguments ${JSON.stringify(args)}`, async () => {
      const { result, rows } = await refusedCall(panelTurn(), args);

      assertEquals((result as { error: string }).error, "invalid_arguments");
      assertStrictEquals(rows.length, 0);
    });
  }

  await t.step("the message's steps are used up", async () => {
    const steps = tablesWith(
      Array.from({ length: DEVICE_STEPS_PER_MESSAGE }, (_, index) =>
        actionRow({ id: `step-${index}`, status: "done" }),
      ),
    );
    const { result, rows } = await refusedCall(
      panelTurn(),
      {},
      "browser_read_page",
      steps,
    );

    assertEquals((result as { error: string }).error, "step_limit");
    assertStrictEquals(rows.length, DEVICE_STEPS_PER_MESSAGE);
  });

  await t.step("one step short of the limit still writes", async () => {
    const steps = tablesWith(
      Array.from({ length: DEVICE_STEPS_PER_MESSAGE - 1 }, (_, index) =>
        actionRow({ id: `step-${index}`, status: "done" }),
      ),
    );
    const { turn } = await openOver(steps, panelTurn());

    assertEquals(
      deviceActionOf(await turn.call("browser_read_page", {}))?.tool,
      "browser_read_page",
    );
  });
});

/** A step turn on the tab `tabUrl`, as a passing verdict builds it. */
function stepTurn(tabUrl: string, origins = ORIGINS): StepTurn {
  return {
    tenantId: TENANT,
    userId: ME,
    runId: RUN,
    conversationId: CONVERSATION,
    tabUrl,
    offered: ["browser_read_page"],
    origins,
    tainted: false,
    now: () => NOW,
  };
}

Deno.test("the step checks the page itself before it writes", async (t) => {
  await t.step(
    "a never-controllable tab is refused without a row",
    async () => {
      const tables = tablesWith([]);

      const result = await startDeviceStep(
        fakeDb(tables),
        stepTurn("https://vercel.com/dashboard"),
        "browser_read_page",
        {},
      );

      assertEquals((result as { error: string }).error, "never");
      assertStrictEquals(tables.carmen_device_actions.length, 0);
    },
  );

  await t.step(
    "a contract TypeError refuses loudly, without a row",
    async () => {
      const tables = tablesWith([]);
      let result: unknown;

      const errors = await capturing("error", async () => {
        result = await startDeviceStep(
          fakeDb(tables),
          stepTurn(`${PAGE.origin}${PAGE.path}`, BROKEN_ORIGINS),
          "browser_read_page",
          {},
        );
      });

      assertEquals((result as { error: string }).error, "configuration");
      assertStrictEquals(errors.length, 1);
      assertStrictEquals(tables.carmen_device_actions.length, 0);
    },
  );
});
