import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { CARMEN_EXECUTOR_TOOLS } from "../approvals/executor-tools.ts";
import { approvalRiskClass } from "../approvals/risk-classes.ts";
import {
  DEVICE_ACTION_STATUS,
  DEVICE_CARD_LIFE_MS,
  DEVICE_CONTINUATION_TEXT,
  DEVICE_PAUSE_LINE,
  DEVICE_STEPS_PER_MESSAGE,
  DEVICE_TOOL_NAMES,
  DEVICE_TOOLS,
  isDeviceToolName,
} from "./contract.ts";

Deno.test("device contract: tools", async (t) => {
  await t.step("the five tools, each read or act", () => {
    assertEquals(
      DEVICE_TOOL_NAMES.map((name) => [name, DEVICE_TOOLS[name].risk]),
      [
        ["browser_read_page", "read"],
        ["browser_navigate", "act"],
        ["browser_click", "act"],
        ["browser_type", "act"],
        ["browser_screenshot", "read"],
      ],
    );
  });

  await t.step("each tool's arguments", () => {
    assertEquals(
      DEVICE_TOOL_NAMES.map((name) => DEVICE_TOOLS[name].parameters.required),
      [[], ["url"], ["snapshot_id", "ref"], ["snapshot_id", "ref", "text"], []],
    );
  });

  await t.step("every required argument is described in the schema", () => {
    for (const name of DEVICE_TOOL_NAMES) {
      const { properties, required } = DEVICE_TOOLS[name].parameters;

      assertEquals(Object.keys(properties), [...required], name);
    }
  });

  await t.step("a name is a device tool only when the table has it", () => {
    assertStrictEquals(isDeviceToolName("browser_click"), true);

    for (const name of [
      "send_message",
      "toString",
      "constructor",
      "",
      7,
      null,
    ]) {
      assertStrictEquals(isDeviceToolName(name), false, String(name));
    }
  });
});

// Security rule 1 of AIO-656: a device action is approved by a tap on the extension's own
// card and by nothing else. A tool on the executor list could be approved with "כן" in the
// chat, and one with a risk class would be offered to an approver on the Approvals screen.
Deno.test("device contract: no device tool is a chat approval", async (t) => {
  await t.step("none is on carmen-approval-execute's list", () => {
    assertEquals(
      CARMEN_EXECUTOR_TOOLS.filter((tool) => isDeviceToolName(tool)),
      [],
    );
  });

  await t.step("none has an approval risk class", () => {
    for (const tool_name of DEVICE_TOOL_NAMES) {
      assertStrictEquals(
        approvalRiskClass({ tool_name }),
        "unknown",
        tool_name,
      );
    }
  });
});

Deno.test("device contract: statuses, limits and fixed lines", async (t) => {
  await t.step("the row statuses, once each", () => {
    assertEquals(
      [...DEVICE_ACTION_STATUS],
      [
        "pending",
        "claimed",
        "done",
        "refused",
        "denied",
        "target_changed",
        "expired",
        "cancelled",
        "outcome_unknown",
      ],
    );
    assertStrictEquals(
      new Set(DEVICE_ACTION_STATUS).size,
      DEVICE_ACTION_STATUS.length,
    );
  });

  await t.step(
    "a card lives two minutes and a message gets twelve steps",
    () => {
      assertStrictEquals(DEVICE_CARD_LIFE_MS, 120_000);
      assertStrictEquals(DEVICE_STEPS_PER_MESSAGE, 12);
    },
  );

  await t.step(
    "the continuation text and the pause line are one line each",
    () => {
      for (const line of [DEVICE_CONTINUATION_TEXT, DEVICE_PAUSE_LINE]) {
        assertStrictEquals(
          line.trim().length > 0 && !line.includes("\n"),
          true,
        );
      }
    },
  );
});
