import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { DEVICE_STEPS_PER_MESSAGE } from "../../_shared/carmen/device/contract.ts";
import {
  type DeviceTurnFacts,
  deviceTurnVerdict,
  offeredDeviceTools,
} from "./eligibility.ts";
import { deviceRequestOf } from "./request.ts";
import {
  ACTION,
  BROKEN_ORIGINS,
  capturing,
  CONVERSATION,
  ORIGINS,
  RUN,
  TAB_CONTEXT,
} from "./turn.test-fixture.ts";

/** The facts of a panel turn that may hold a step, with `overrides`. */
function facts(overrides: Partial<DeviceTurnFacts> = {}): DeviceTurnFacts {
  return {
    authKind: "user",
    surface: "internal_chat",
    isCarmen: true,
    pinSkillsOnly: false,
    inWorkshop: false,
    automationRun: false,
    taskMode: undefined,
    pickedBrain: false,
    agentEngine: "gemini-3-flash",
    conversationId: CONVERSATION,
    runId: RUN,
    contextMetadata: TAB_CONTEXT,
    origins: ORIGINS,
    ...overrides,
  };
}

/** What the turn is offered with `overrides`, as the panel announced the read. */
function offered(overrides: Partial<DeviceTurnFacts> = {}) {
  return offeredDeviceTools(
    deviceTurnVerdict(facts(overrides)),
    ["browser_read_page"],
    0,
  );
}

Deno.test(
  "the browser read is offered only when every condition holds",
  async (t) => {
    await t.step(
      "a signed-in user's panel message beside a readable tab",
      () => {
        assertEquals(offered(), ["browser_read_page"]);
        assertEquals(offered({ pickedBrain: true }), ["browser_read_page"]);
      },
    );

    const excluded: Array<[string, Partial<DeviceTurnFacts>]> = [
      [
        "a service caller (WhatsApp, automations, tasks)",
        { authKind: "service" },
      ],
      ["no authentication kind", { authKind: undefined }],
      ["WhatsApp", { surface: "whatsapp" }],
      ["the AIOS dialog", { surface: "aios" }],
      ["a task", { surface: "task" }],
      ["the Grok bot", { surface: "grok_bot" }],
      ["an agent that is not Carmen", { isCarmen: false }],
      ["an isolated session", { pinSkillsOnly: true }],
      ["the workshop", { inWorkshop: true }],
      ["an automation run", { automationRun: true }],
      ["task mode", { taskMode: true }],
      ["a Manus-engine agent", { agentEngine: "manus-1" }],
      ["no saved conversation", { conversationId: null }],
      ["a run id that is not a uuid", { runId: "run-1" }],
      ["no run id", { runId: undefined }],
      [
        "the sidecar's screen instead of a tab",
        { contextMetadata: { source: "command_center_sidebar", route: "/" } },
      ],
      ["no screen context", { contextMetadata: undefined }],
      [
        "a tab on AIOS itself",
        {
          contextMetadata: {
            ...TAB_CONTEXT,
            url: "https://aios.co.il/command",
          },
        },
      ],
      [
        "a tab on Google sign-in",
        {
          contextMetadata: {
            ...TAB_CONTEXT,
            url: "https://accounts.google.com/signin",
          },
        },
      ],
    ];
    for (const [name, overrides] of excluded) {
      await t.step(`not for ${name}`, () => {
        assertEquals(offered(overrides), []);
      });
    }

    await t.step(
      "a Manus engine is fine when a picked brain runs the loop",
      () => {
        assertEquals(offered({ agentEngine: "manus-1", pickedBrain: true }), [
          "browser_read_page",
        ]);
      },
    );

    await t.step("not when the panel did not announce the read", () => {
      assertEquals(
        offeredDeviceTools(deviceTurnVerdict(facts()), ["browser_click"], 0),
        [],
      );
      assertEquals(offeredDeviceTools(deviceTurnVerdict(facts()), [], 0), []);
    });

    await t.step("not once the message used its steps", () => {
      const verdict = deviceTurnVerdict(facts());

      assertEquals(
        offeredDeviceTools(
          verdict,
          ["browser_read_page"],
          DEVICE_STEPS_PER_MESSAGE - 1,
        ),
        ["browser_read_page"],
      );
      assertEquals(
        offeredDeviceTools(
          verdict,
          ["browser_read_page"],
          DEVICE_STEPS_PER_MESSAGE,
        ),
        [],
      );
    });

    await t.step(
      "an unreadable environment refuses loudly and offers nothing",
      async () => {
        let verdict = deviceTurnVerdict(facts());
        const errors = await capturing("error", () => {
          verdict = deviceTurnVerdict(facts({ origins: BROKEN_ORIGINS }));
          return Promise.resolve();
        });

        assertEquals(verdict, { refusal: "configuration" });
        assertStrictEquals(errors.length, 1);
      },
    );
  },
);

Deno.test("the request's device fields", async (t) => {
  await t.step("only device tool names are announced", () => {
    assertEquals(
      deviceRequestOf({
        device: { tools: ["browser_read_page", "send_message", 7, "toString"] },
      }).announced,
      ["browser_read_page"],
    );
    assertEquals(
      deviceRequestOf({ device: "browser_read_page" }).announced,
      [],
    );
    assertEquals(deviceRequestOf(null).announced, []);
  });

  await t.step("a continuation names one action id or none", () => {
    assertStrictEquals(deviceRequestOf({}).continuation, null);
    assertEquals(
      deviceRequestOf({ device_continuation: ACTION }).continuation,
      {
        actionId: ACTION,
      },
    );
    assertEquals(
      deviceRequestOf({ device_continuation: "1; drop table" }).continuation,
      { actionId: null },
    );
    assertEquals(deviceRequestOf({ device_continuation: {} }).continuation, {
      actionId: null,
    });
  });
});
