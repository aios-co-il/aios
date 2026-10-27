import { CALLER_ROLE_PRIORITY } from "../caller-roles.ts";
import {
  isBarePulseRefreshRequest,
  isPulseRefreshRequest,
} from "./refresh-request.ts";
import { REFRESH_CAMPAIGN_PULSE_TOOL } from "./tool.ts";

/** The caller run-ai-agent resolved for this turn. */
export type PulseCaller = {
  campaignerId?: string | null;
  userId?: string | null;
  role?: string | null;
};

/** Round 0's handling of a pulse refresh request. */
export type PulseRefreshRoute = {
  forceRefresh: boolean;
  digestShortcut: boolean;
};

/** A tool entry as capToolsForTarget returns it. */
type CappedTool = { function?: { name?: string } };

/**
 * How run-ai-agent routes a pulse refresh request (AIO-237).
 *   forceRefresh   round 0 must call refresh_campaign_pulse. A compound
 *                  request ("שלחי לפליקס את הדופק המעודכן") still goes on to
 *                  round 1, so the model can send or schedule.
 *   digestShortcut on WhatsApp and task surfaces, answer with refresh_note and
 *                  the digest and end the turn. Bare requests only.
 * Neither applies outside Carmen, in isolated sessions, or to non-staff callers.
 */
export function decidePulseRefreshRouting({
  text,
  isCarmen,
  pinSkillsOnly = false,
  digestSurface = false,
  caller,
}: {
  text?: string | null;
  isCarmen?: boolean;
  pinSkillsOnly?: boolean;
  digestSurface?: boolean;
  caller?: PulseCaller;
} = {}): PulseRefreshRoute {
  if (!isCarmen || pinSkillsOnly || !isStaffPulseCaller(caller)) {
    return { forceRefresh: false, digestShortcut: false };
  }
  const forceRefresh = isPulseRefreshRequest(text);
  return {
    forceRefresh,
    digestShortcut:
      forceRefresh && Boolean(digestSurface) && isBarePulseRefreshRequest(text),
  };
}

/**
 * The tool_choice that makes round 0 call refresh_campaign_pulse, or null when
 * the route does not force it or the tool was capped out of this request.
 */
export function pulseRefreshToolChoice(
  route: PulseRefreshRoute,
  cappedTools: readonly CappedTool[],
): { type: "function"; function: { name: string } } | null {
  const { name } = REFRESH_CAMPAIGN_PULSE_TOOL;
  const offered = cappedTools.some((tool) => tool.function?.name === name);
  if (!route.forceRefresh || !offered) {
    return null;
  }
  return { type: "function", function: { name } };
}

/**
 * A caller run-ai-agent identified as staff: a campaigner matched by phone, or
 * a user with a staff role. WhatsApp client contacts and unknown senders have
 * neither.
 */
export function isStaffPulseCaller({
  campaignerId,
  userId,
  role,
}: PulseCaller = {}): boolean {
  return (
    Boolean(campaignerId) || (Boolean(userId) && STAFF_ROLES.has(role ?? ""))
  );
}

const STAFF_ROLES = new Set(CALLER_ROLE_PRIORITY);
