/**
 * The device side of a turn as handleRunAgent uses it (AIO-686): the tools to add and
 * withhold, the user turn, and the answer to a device or withheld tool call.
 */
import {
  DEVICE_TOOLS,
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
import { type DeviceToolResult, startDeviceStep } from "./step.ts";
import { sendsOrWrites, withheldToolRefusal } from "./withheld.ts";

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
};

/** A turn being opened: its database, input, environment, clock and verdict. */
export type OpenTurn = {
  db: DeviceDb;
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

  return {
    continuing: holdsPageData,
    reply: null,
    offeredTools: offered.map((name) => ({ name, ...DEVICE_TOOLS[name] })),
    withoutWithheld: (tools) =>
      holdsPageData ? tools.filter((tool) => !sendsOrWrites(tool.name)) : tools,
    userTurn: (text) =>
      resumed ? `${text}\n\n${deviceDataBlock(resumed)}` : text,
    handles: (toolName) =>
      isDeviceToolName(toolName) || (holdsPageData && sendsOrWrites(toolName)),
    call: (toolName, args) => {
      if (!isDeviceToolName(toolName)) {
        return Promise.resolve(withheldToolRefusal(toolName));
      }
      if (verdict.refusal !== null || !input.userId) {
        return Promise.resolve({
          error: "not_offered",
          message: "הכלי לא זמין בתור הזה.",
        });
      }
      return startDeviceStep(
        turn.db,
        {
          tenantId: input.tenantId,
          userId: input.userId,
          runId: verdict.runId,
          conversationId: verdict.conversationId,
          tabUrl: verdict.tabUrl,
          offered,
          origins: turn.origins,
          tainted: resumed?.tainted ?? false,
          now: turn.now,
        },
        toolName,
        args,
      );
    },
  };
}

/** A turn answered before any model call. */
export function answered(reply: Response): DeviceTurn {
  return {
    continuing: true,
    reply,
    offeredTools: [],
    withoutWithheld: (tools) => tools,
    userTurn: (text) => text,
    handles: () => false,
    call: () => Promise.reject(new Error("answered without the model")),
  };
}
