/**
 * The model called a device tool (AIO-686). The server checks the call and the page, writes
 * one pending `carmen_device_actions` row and ends the turn; the panel claims the row by its
 * id. A call that fails a check writes no row and goes back to the model as a tool error,
 * so the turn goes on without a step.
 */
import {
  deviceCardRule,
  holdsAnotherOrigin,
} from "../../_shared/carmen/device/card-rule.ts";
import {
  DEVICE_STEPS_PER_MESSAGE,
  DEVICE_TOOLS,
  type DeviceActionReply,
  type DeviceToolName,
  isDeviceToolName,
} from "../../_shared/carmen/device/contract.ts";
import type { EnvironmentOrigins } from "../../_shared/carmen/device/never-controllable.ts";
import {
  type DeviceDb,
  insertStep,
  readRunSteps,
  type RunKey,
} from "./rows.ts";

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
  if (!argumentsFit(toolName, args)) {
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
  const rule = cardRule(toolName, turn, tabTainted(turn, steps));
  if (rule !== "free" && rule !== "ask") {
    return refusal(toolName, rule, "אין לי גישה לדף הזה.");
  }

  const actionId = await insertStep(db, {
    ...turn,
    tool: toolName,
    now: turn.now(),
  });
  return {
    device_action: { action_id: actionId, tool: toolName },
    message: "הפעולה נשלחה לתוסף בדפדפן; התשובה תמשיך כשהיא תסתיים.",
  };
}

/** Whether the arguments are exactly the tool's: every argument it names, each a string, nothing else. */
function argumentsFit(tool: DeviceToolName, args: unknown): boolean {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return false;
  }
  const expected = Object.keys(DEVICE_TOOLS[tool].parameters.properties);
  const given = Object.entries(args);

  return (
    given.length === expected.length &&
    given.every(
      ([name, value]) => expected.includes(name) && typeof value === "string",
    )
  );
}

/**
 * The card rule for the step on the reported tab, or `configuration` when the contract
 * throws on this environment's settings: logged, and the step is refused.
 */
function cardRule(
  tool: DeviceToolName,
  turn: StepTurn,
  tainted: boolean,
): string {
  try {
    return deviceCardRule({
      tool,
      url: turn.tabUrl,
      trusted: false,
      tainted,
      origins: turn.origins,
      // The tenant's own floor hosts arrive with the act tools (AIO-656).
      addedActNeverHosts: [],
      // Unknown on the server, so the tighter answer.
      sensitivePage: true,
      sensitiveScreenshotsAllowed: false,
    });
  } catch (error) {
    console.error(
      `[device] ${tool} refused: the card rule cannot be read`,
      error,
    );
    return "configuration";
  }
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
