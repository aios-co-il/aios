/**
 * The device side of a turn over in-memory rows, for the device-turn tests. The rows fake is
 * carmen-device-action's, so the panel's function and this side are tested on one stand-in.
 */
import {
  fakeDb,
  type FakeRow,
  type FakeTables,
} from "../../carmen-device-action/action-db.test-fixture.ts";
import {
  actionRow,
  ME,
  NOW,
  PAGE,
  RUN,
  SNAPSHOT,
  TENANT,
} from "../../carmen-device-action/handler.test-fixture.ts";
import { browserTabContextMetadata } from "../../_shared/carmen/screen-context.ts";
import type { EnvironmentOrigins } from "../../_shared/carmen/device/never-controllable.ts";
import { type DeviceTurnInput, openDeviceTurn } from "./turn.ts";

export {
  ACTION,
  actionRow,
  COLLEAGUE,
  ME,
  NOW,
  OTHER_TENANT,
  PAGE,
  RUN,
  SNAPSHOT,
  TENANT,
} from "../../carmen-device-action/handler.test-fixture.ts";
export { fakeDb } from "../../carmen-device-action/action-db.test-fixture.ts";

export const CONVERSATION = "77777777-7777-4777-8777-777777777777";
export const OTHER_CONVERSATION = "88888888-8888-4888-8888-888888888888";
export const OTHER_RUN = "99999999-9999-4999-8999-999999999999";

/** A Staging-like environment: the app and the backend each at one address. */
export const ORIGINS: EnvironmentOrigins = {
  appOrigins: ["https://staging.aios.co.il"],
  backendOrigins: ["https://abcdefghijklmnop.supabase.co"],
};

/** A configured origin with no host: the contract throws on it. */
export const BROKEN_ORIGINS: EnvironmentOrigins = {
  appOrigins: ["staging.aios.co.il"],
  backendOrigins: [],
};

/** The tab beside the panel, as the site reports it. */
export const TAB_CONTEXT = browserTabContextMetadata(
  { url: `${PAGE.origin}${PAGE.path}`, title: "Pricing" },
  NOW.toISOString(),
);

/** A typed message from the extension's panel that may hold a step, with `overrides`. */
export function panelTurn(
  overrides: Partial<DeviceTurnInput> = {},
  body: Record<string, unknown> = {},
): DeviceTurnInput {
  return {
    body: {
      run_id: RUN,
      context_metadata: TAB_CONTEXT,
      device: { tools: ["browser_read_page"] },
      ...body,
    },
    authKind: "user",
    surface: "internal_chat",
    isCarmen: true,
    pinSkillsOnly: false,
    inWorkshop: false,
    automationRun: false,
    taskMode: undefined,
    pickedBrain: false,
    agentEngine: "gemini-3-flash",
    tenantId: TENANT,
    userId: ME,
    conversationId: CONVERSATION,
    origins: ORIGINS,
    now: () => NOW,
    ...overrides,
  };
}

/** A completed read of `example.com/pricing` in this run and conversation, with `overrides`. */
export function doneRow(overrides: FakeRow = {}): FakeRow {
  return actionRow({
    conversation_id: CONVERSATION,
    status: "done",
    decision: "free",
    observed_origin: PAGE.origin,
    observed_path: PAGE.path,
    result: structuredClone(SNAPSHOT),
    claimed_at: NOW.toISOString(),
    completed_at: NOW.toISOString(),
    ...overrides,
  });
}

/** Tables holding these steps and stops. */
export function tablesWith(
  steps: Array<FakeRow>,
  stops: Array<FakeRow> = [],
): FakeTables {
  return { carmen_device_actions: steps, carmen_run_cancellations: stops };
}

/** Opens a turn over the tables; `failing` names a table whose queries fail. Collects emitted events. */
export async function openOver(
  tables: FakeTables,
  input: DeviceTurnInput,
  failing?: string,
) {
  const emitted: Array<unknown> = [];
  const turn = await openDeviceTurn(
    fakeDb(tables, undefined, failing),
    (event) => emitted.push(event),
    input,
  );
  return { turn, emitted };
}

/** Records console output of one kind while `run` runs; the lines, joined per call. */
export async function capturing(
  kind: "warn" | "error",
  run: () => Promise<unknown>,
): Promise<Array<string>> {
  const original = console[kind];
  const lines: Array<string> = [];
  console[kind] = (...args: Array<unknown>) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await run();
  } finally {
    console[kind] = original;
  }
  return lines;
}
