/**
 * The model called a device tool (AIO-686). The server checks the call and the page (a
 * navigation's destination, a click's or type's element in the run's latest read), writes
 * one pending `carmen_device_actions` row and ends the turn; the panel claims the row by
 * its id. A call that fails a check writes no row and goes back to the model as a tool error,
 * so the turn goes on without a step.
 */
import { holdsAnotherOrigin } from "../../_shared/carmen/device/card-rule.ts";
import {
  DEVICE_STEPS_PER_MESSAGE,
  DEVICE_TOOLS,
  type DeviceActionReply,
  type DeviceToolName,
  isDeviceToolName,
} from "../../_shared/carmen/device/contract.ts";
import { navigateDestination } from "../../_shared/carmen/device/navigate-destination.ts";
import type { EnvironmentOrigins } from "../../_shared/carmen/device/never-controllable.ts";
import { ACT_REFUSAL_MESSAGE, actArgumentsRefusal } from "./act-target.ts";
import {
  type DeviceDb,
  insertStep,
  readRunSteps,
  type RunKey,
} from "./rows.ts";
import { cardRule } from "./step-rule.ts";

/** What a device tool call returns to the loop. */
export type DeviceToolResult =
  | { device_action: DeviceActionReply; message: string }
  | { error: string; message: string };

/** The turn a step may start in, as the turn's verdict and the request set it. */
export type StepTurn = RunKey & {
  conversationId: string;
  /** The tab beside the panel, as the request reported it; the panel checks the real one. */
  tabUrl: string;
  offered: ReadonlyArray<DeviceToolName>;
  origins: EnvironmentOrigins;
  now: () => Date;
  /** The user's permission to picture a sensitive page, read on the server; asked only for a screenshot. */
  sensitiveScreenshotsAllowed: () => Promise<boolean>;
};

/** Checks one device tool call and, when it passes, writes its pending row. */
export async function startDeviceStep(
  db: DeviceDb,
  turn: StepTurn,
  toolName: string,
  args: unknown,
): Promise<DeviceToolResult> {
  if (!isDeviceToolName(toolName) || !turn.offered.includes(toolName)) {
    return notOffered(toolName);
  }
  const stored = storedArguments(toolName, args);
  if (!stored) {
    return refusal(toolName, "invalid_arguments", "הארגומנטים לא תואמים לכלי.");
  }
  const steps = await readRunSteps(db, turn);
  if (steps.length >= DEVICE_STEPS_PER_MESSAGE) {
    return refusal(
      toolName,
      "step_limit",
      "הגעתי למספר הפעולות בדפדפן להודעה אחת.",
    );
  }
  const actRefusal = actArgumentsRefusal(toolName, stored, steps, turn.tabUrl);
  if (actRefusal) {
    return refusal(toolName, actRefusal, ACT_REFUSAL_MESSAGE[actRefusal]);
  }
  const facts = {
    tainted: tabTainted(turn, steps),
    permission:
      toolName === "browser_screenshot" &&
      (await turn.sensitiveScreenshotsAllowed()),
  };
  // A navigation is ruled on twice: the tab it leaves and the destination it opens.
  const refused = [turn.tabUrl, ...(stored.url ? [stored.url] : [])]
    .map((url) => cardRule(toolName, url, turn.origins, facts))
    .find((rule) => rule !== "free" && rule !== "ask");
  if (refused) {
    return refusal(toolName, refused, "אין לי גישה לדף הזה.");
  }

  const actionId = await insertStep(db, {
    ...turn,
    tool: toolName,
    arguments: stored,
    now: turn.now(),
  });
  return {
    device_action: { action_id: actionId, tool: toolName },
    message: "הפעולה נשלחה לתוסף בדפדפן; התשובה תמשיך כשהיא תסתיים.",
  };
}

/**
 * The arguments the row stores, or null unless they are exactly the tool's: every argument
 * it names, each a string, nothing else. A navigation's destination must also be one
 * address (`navigateDestination`), stored as the parser writes it, so the card rule and
 * the panel read the same address.
 */
function storedArguments(
  tool: DeviceToolName,
  args: unknown,
): Record<string, string> | null {
  if (tool === "browser_navigate") {
    const url = navigateDestination(args);
    return url ? { url } : null;
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }
  const expected = Object.keys(DEVICE_TOOLS[tool].parameters.properties);
  const given = Object.entries(args);
  const strings = given.flatMap(([name, value]) =>
    typeof value === "string" && expected.includes(name)
      ? [[name, value] as const]
      : [],
  );

  return given.length === expected.length && strings.length === given.length
    ? Object.fromEntries(strings)
    : null;
}

/**
 * Whether the run already holds page text from an origin other than this tab's (plan rule
 * 9): the card rule's taint input, measured against the tab the step is for. Logged.
 */
function tabTainted(
  turn: StepTurn,
  steps: Array<{ observed_origin: string | null }>,
): boolean {
  const origins = steps.flatMap((step) =>
    step.observed_origin ? [step.observed_origin] : [],
  );
  const tainted = holdsAnotherOrigin(turn.tabUrl, origins);
  if (tainted) {
    console.warn(
      `[device] run=${turn.runId} step tainted: the run read another origin`,
    );
  }
  return tainted;
}

/** The refusal of a device tool this turn was not offered. */
export function notOffered(toolName: string): DeviceToolResult {
  return refusal(toolName, "not_offered", "הכלי לא זמין בתור הזה.");
}

/** A refused call: logged with the reason, returned to the model as a tool error. */
function refusal(
  toolName: string,
  reason: string,
  message: string,
): DeviceToolResult {
  console.warn(`[device] ${toolName} refused: ${reason}`);
  return { error: reason, message };
}
