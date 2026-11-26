/**
 * Which turns may hold a device step (AIO-686): a signed-in user's own message in the
 * Command Center, sent from the extension's side panel beside a tab Carmen may read, in a
 * saved conversation, on Carmen's loop. Never WhatsApp, a service caller, a task, an
 * automation, the workshop, an isolated session or a Manus-engine agent. A model brain the
 * user picked runs this loop only when its owner approved client data for it
 * (`_shared/carmen/brain-engine/plan.ts`), so it may; a dispatched brain never reaches here.
 */
import {
  DEVICE_STEPS_PER_MESSAGE,
  type DeviceToolName,
} from "../../_shared/carmen/device/contract.ts";
import {
  type EnvironmentOrigins,
  isNeverControllable,
} from "../../_shared/carmen/device/never-controllable.ts";
import {
  parseScreenContext,
  SCREEN_CONTEXT_SOURCE,
} from "../../_shared/carmen/screen-context.ts";
import { appOrigin } from "../../_shared/carmen/skin-gallery.ts";
import { MODEL_CATALOG, resolveModelId } from "../../_shared/models.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import type { Surface } from "../surface.ts";

/**
 * The device tools the server offers, beside a readable tab and only those the panel
 * announced. The screenshot joins with the extension pull request that draws its card
 * (AIO-656).
 */
export const OFFERED_DEVICE_TOOLS: ReadonlyArray<DeviceToolName> = [
  "browser_read_page",
  "browser_navigate",
  "browser_click",
  "browser_type",
];

/** The tools that name an element of the run's latest read: offered only while one may be named (`actTarget`). */
const ELEMENT_TOOLS: ReadonlyArray<DeviceToolName> = [
  "browser_click",
  "browser_type",
];

/** What decides whether a turn may hold a device step, as handleRunAgent knows it. */
export type DeviceTurnFacts = {
  /** How requireAuth authenticated the request. */
  authKind?: string;
  surface: Surface;
  isCarmen: boolean;
  pinSkillsOnly: boolean;
  inWorkshop: boolean;
  automationRun: boolean;
  taskMode: unknown;
  /** A model brain the user picked runs the loop. */
  pickedBrain: boolean;
  /** The agent's engine (`agent.engine`, or a service caller's override). */
  agentEngine: string | null;
  conversationId: string | null;
  runId: unknown;
  contextMetadata: unknown;
  origins: EnvironmentOrigins;
};

/**
 * Why this turn may not hold a device step, or null when it may, with its run and
 * conversation. `tabUrl` is the readable tab beside the panel, or null: without one no step
 * is offered, yet a continuation still resumes, since the user may have moved on since.
 */
export type DeviceTurnVerdict =
  | {
      refusal: null;
      runId: string;
      conversationId: string;
      tabUrl: string | null;
    }
  | { refusal: string };

/** This environment's own addresses: the app (`APP_URL`) and its Supabase project. */
export function serverOrigins(): EnvironmentOrigins {
  return {
    appOrigins: [appOrigin(null, Deno.env.get("APP_URL"))],
    backendOrigins: [Deno.env.get("SUPABASE_URL") ?? ""],
  };
}

/** Whether this turn may hold a device step, and the readable tab beside the panel. */
export function deviceTurnVerdict(facts: DeviceTurnFacts): DeviceTurnVerdict {
  const refusal = callerRefusal(facts) ?? engineRefusal(facts);
  if (refusal) {
    return { refusal };
  }
  const runId = asUuidOrNull(facts.runId);
  if (!facts.conversationId || !runId) {
    return { refusal: "no_conversation_or_run" };
  }
  return {
    refusal: null,
    runId,
    conversationId: facts.conversationId,
    tabUrl: readableTab(facts),
  };
}

/**
 * The address of the tab beside the panel when Carmen may read it, else null. A
 * configuration the contract cannot read (an origin with no host) throws there; it is
 * logged and counts as no readable tab, so nothing is offered.
 */
function readableTab(facts: DeviceTurnFacts): string | null {
  const context = parseScreenContext(facts.contextMetadata);
  if (context?.source !== SCREEN_CONTEXT_SOURCE.browserTab) {
    return null;
  }

  try {
    return isNeverControllable(context.tab.url, facts.origins)
      ? null
      : context.tab.url;
  } catch (error) {
    console.error("[device] the never-list cannot be read", error);
    return null;
  }
}

/**
 * The tools to offer: beside a readable tab, those the panel announced and the server
 * offers, while steps remain. A click or type only when `elementsNamable`: the run holds a
 * read of the tab's page that nothing changed since and no other site's page beside it.
 */
export function offeredDeviceTools(
  verdict: DeviceTurnVerdict,
  announced: ReadonlyArray<DeviceToolName>,
  stepsUsed: number,
  elementsNamable: boolean,
): Array<DeviceToolName> {
  if (
    verdict.refusal !== null ||
    verdict.tabUrl === null ||
    stepsUsed >= DEVICE_STEPS_PER_MESSAGE
  ) {
    return [];
  }
  return OFFERED_DEVICE_TOOLS.filter(
    (tool) =>
      announced.includes(tool) &&
      (elementsNamable || !ELEMENT_TOOLS.includes(tool)),
  );
}

/** Who sent the turn: only a signed-in user's own Command Center message on Carmen. */
function callerRefusal(facts: DeviceTurnFacts): string | null {
  if (facts.authKind !== "user") {
    return "not_a_signed_in_user";
  }
  if (facts.surface !== "internal_chat") {
    return "not_the_command_center";
  }
  if (!facts.isCarmen) {
    return "not_carmen";
  }
  if (facts.pinSkillsOnly || facts.inWorkshop) {
    return "isolated_or_workshop";
  }
  return facts.automationRun || facts.taskMode ? "task_or_automation" : null;
}

/** Which engine answers: Carmen's loop, never a Manus delegation that would get the page as a task. */
function engineRefusal(facts: DeviceTurnFacts): string | null {
  if (facts.pickedBrain) {
    return null;
  }
  const model = resolveModelId(facts.agentEngine);
  const family = MODEL_CATALOG.find((entry) => entry.id === model)?.family;

  return family === "manus" ? "manus_engine" : null;
}
