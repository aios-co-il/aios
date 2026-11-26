/**
 * The device side of a turn as handleRunAgent uses it (AIO-686): the tools to add and
 * withhold, the user turn, and the answer to a device or withheld tool call.
 */
import {
  DEVICE_ACTION_EVENT,
  DEVICE_TOOLS,
  type DeviceActionReply,
  isDeviceToolName,
} from "../../_shared/carmen/device/contract.ts";
import type { EnvironmentOrigins } from "../../_shared/carmen/device/never-controllable.ts";
import type { ToolDef } from "../../_shared/carmen-token-optimizer.ts";
import { deviceDataBlock, type StepOutcome } from "./data-block.ts";
import type {
  DeviceTurnFacts,
  DeviceTurnVerdict,
  offeredDeviceTools,
} from "./eligibility.ts";
import type { DeviceDb } from "./rows.ts";
import { type DeviceToolResult, notOffered, startDeviceStep } from "./step.ts";
import { withheldAfterPageRead, withheldToolRefusal } from "./withheld.ts";

export type Emit = ((event: unknown) => void) | undefined;

/** What handleRunAgent knows when it opens the turn. */
export type DeviceTurnInput = Omit<
  DeviceTurnFacts,
  "origins" | "runId" | "contextMetadata"
> & {
  body: Record<string, unknown>;
  tenantId: string;
  userId: string | null;
  origins?: EnvironmentOrigins;
  now?: () => Date;
};

/** The device side of one turn. */
export type DeviceTurn = {
  /** The request resumes a paused run: its fixed `command_text` is not saved. */
  continuing: boolean;
  /** Carmen's full loop must answer: a resumed run, or a turn offered a device tool. */
  pinsModel: boolean;
  /** The whole answer when the request ends before any model call, else null. */
  reply: Response | null;
  /** The device tools to add to the model's tools. */
  offeredTools: Array<ToolDef>;
  /** The tools without those withheld while the turn holds page text (plan rule 9). */
  withoutWithheld<Tool extends { name: string }>(
    tools: Array<Tool>,
  ): Array<Tool>;
  /** The user turn with the resumed step's data block after it. */
  userTurn(text: string): string;
  /** Whether a tool call is the device turn's to answer: any device tool, and a withheld tool. */
  handles(toolName: string): boolean;
  call(
    toolName: string,
    args: unknown,
  ): Promise<DeviceToolResult | ReturnType<typeof withheldToolRefusal>>;
  /**
   * The step a tool result started, emitted as the device action event, or null. Only a
   * result `call` returned after writing a row counts: a look-alike from any other tool
   * (a connector's, say) never pauses the turn or reaches the site.
   */
  pausedAt(result: unknown): DeviceActionReply | null;
};

/** A turn being opened: its database, stream, input, environment, clock and verdict. */
export type OpenTurn = {
  db: DeviceDb;
  emit: Emit;
  input: DeviceTurnInput;
  origins: EnvironmentOrigins;
  now: () => Date;
  verdict: DeviceTurnVerdict;
};

/** The device side of a turn that runs the model; `resumed` is the step a continuation resumes. */
export function deviceTurn(
  turn: OpenTurn,
  offered: ReturnType<typeof offeredDeviceTools>,
  resumed: StepOutcome | null,
): DeviceTurn {
  const { verdict, input } = turn;
  const holdsPageData = resumed !== null;
  const written = new WeakMap<object, DeviceActionReply>();

  return {
    continuing: holdsPageData,
    pinsModel: holdsPageData || offered.length > 0,
    reply: null,
    offeredTools: offered.map((name) => ({ name, ...DEVICE_TOOLS[name] })),
    withoutWithheld: (tools) =>
      holdsPageData
        ? tools.filter((tool) => !withheldAfterPageRead(tool.name))
        : tools,
    userTurn: (text) =>
      resumed ? `${text}\n\n${deviceDataBlock(resumed)}` : text,
    handles: (toolName) =>
      isDeviceToolName(toolName) ||
      (holdsPageData && withheldAfterPageRead(toolName)),
    call: async (toolName, args) => {
      if (!isDeviceToolName(toolName)) {
        return withheldToolRefusal(toolName);
      }
      if (verdict.refusal !== null || !verdict.tabUrl || !input.userId) {
        return notOffered(toolName);
      }
      const result = await startDeviceStep(
        turn.db,
        {
          tenantId: input.tenantId,
          userId: input.userId,
          runId: verdict.runId,
          conversationId: verdict.conversationId,
          tabUrl: verdict.tabUrl,
          offered,
          origins: turn.origins,
          now: turn.now,
        },
        toolName,
        args,
      );
      if ("device_action" in result) {
        written.set(result, result.device_action);
      }
      return result;
    },
    pausedAt: (result) => {
      const action =
        result && typeof result === "object" ? written.get(result) : undefined;
      if (!action) {
        return null;
      }
      turn.emit?.({ type: DEVICE_ACTION_EVENT, ...action });
      return action;
    },
  };
}

/** A turn answered before any model call. */
export function answered(reply: Response): DeviceTurn {
  return {
    continuing: true,
    pinsModel: true,
    reply,
    offeredTools: [],
    withoutWithheld: (tools) => tools,
    userTurn: (text) => text,
    handles: () => false,
    call: () => Promise.reject(new Error("answered without the model")),
    pausedAt: () => null,
  };
}
