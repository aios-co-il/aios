/**
 * Trusted sites (AIO-656): the origins a user trusted for one conversation from a click or
 * typing card, in `carmen_device_trusted_sites`. Recorded only by this function, with the
 * service role, from a completed step the panel ran after a card (trust-record.ts); read
 * here when the panel claims a click or a type. Every statement is keyed by the action's own
 * org and user and the action's own conversation, read from its row, so a trust never
 * reaches another user, org or conversation.
 */
import {
  TRUSTABLE_TOOLS,
  type DeviceToolName,
} from "../_shared/carmen/device/contract.ts";
import type { ActionDb, OwnAction } from "./rows.ts";

export const TRUSTED_SITES = "carmen_device_trusted_sites";
const ACTIONS = "carmen_device_actions";

/** What the panel learns at its claim of a click or a type: the conversation and the origin it may run on without a card. */
export type ClaimTrust = {
  conversation_id: string | null;
  trusted_origin: string | null;
};

const NO_TRUST: ClaimTrust = { conversation_id: null, trusted_origin: null };

/**
 * The trust a claimed click or type may run under. The origin is set only when the run's
 * other steps saw exactly one origin (the card rule's `tainted` is false there) and the
 * user trusted that origin in this action's conversation; the panel then still checks that
 * the tab is on it. Any other tool gets no trust, and so does a trust that cannot be read:
 * logged, and the panel asks on its card as without one.
 */
export async function claimTrust(
  serviceDb: ActionDb,
  action: OwnAction,
): Promise<ClaimTrust> {
  try {
    return await readClaimTrust(serviceDb, action);
  } catch (error) {
    console.error(
      `[carmen-device-action] trust for action=${action.id} unreadable; the card asks`,
      error,
    );
    return NO_TRUST;
  }
}

/** Whether a tool's card may offer to trust the site. */
export function isTrustableTool(tool: string): boolean {
  return TRUSTABLE_TOOLS.some(
    (trustable: DeviceToolName) => trustable === tool,
  );
}

/** The claim's trust, read; throws when a read fails. */
async function readClaimTrust(
  serviceDb: ActionDb,
  action: OwnAction,
): Promise<ClaimTrust> {
  if (!isTrustableTool(action.tool)) {
    return NO_TRUST;
  }
  const conversationId = await actionConversation(serviceDb, action);
  if (!conversationId) {
    return NO_TRUST;
  }
  const origins = await runOrigins(serviceDb, action);
  const [only] = origins;
  const trusted =
    origins.size === 1 &&
    (await isTrusted(serviceDb, action, conversationId, only));

  return {
    conversation_id: conversationId,
    trusted_origin: trusted ? only : null,
  };
}

/** The action's conversation, from its row; browsers cannot read the column, so the service role does. */
export async function actionConversation(
  serviceDb: ActionDb,
  action: OwnAction,
): Promise<string | null> {
  const { data, error } = await serviceDb
    .from(ACTIONS)
    .select("conversation_id")
    .eq("id", action.id)
    .eq("tenant_id", action.tenant_id)
    .eq("user_id", action.user_id)
    .maybeSingle();
  if (error) {
    throw new Error(
      `reading the action's conversation failed: ${error.message}`,
    );
  }
  return data?.conversation_id ?? null;
}

/** The distinct origins the run's other steps reported, as run-ai-agent measures taint. */
async function runOrigins(
  serviceDb: ActionDb,
  action: OwnAction,
): Promise<Set<string>> {
  const { data, error } = await serviceDb
    .from(ACTIONS)
    .select("observed_origin")
    .eq("tenant_id", action.tenant_id)
    .eq("user_id", action.user_id)
    .eq("run_id", action.run_id)
    .neq("id", action.id);
  if (error) {
    throw new Error(`reading the run's steps failed: ${error.message}`);
  }
  return new Set(
    (data ?? []).flatMap((step) =>
      step.observed_origin ? [step.observed_origin] : [],
    ),
  );
}

/** Whether the user trusted this exact origin in this conversation. */
async function isTrusted(
  serviceDb: ActionDb,
  action: OwnAction,
  conversationId: string,
  origin: string,
): Promise<boolean> {
  const { data, error } = await serviceDb
    .from(TRUSTED_SITES)
    .select("id")
    .eq("tenant_id", action.tenant_id)
    .eq("user_id", action.user_id)
    .eq("conversation_id", conversationId)
    .eq("origin", origin)
    .maybeSingle();
  if (error) {
    throw new Error(`reading the trusted sites failed: ${error.message}`);
  }
  return data !== null;
}
