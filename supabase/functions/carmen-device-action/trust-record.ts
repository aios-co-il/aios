/**
 * Recording a trusted site (AIO-656): the origin a user ticked "trust this site for this
 * conversation" for on a click or typing card, written to `carmen_device_trusted_sites` with
 * the service role, for the action's own org, user and conversation (trust.ts reads it).
 */
import type { ActionDb, OwnAction } from "./rows.ts";
import { actionConversation, isTrustableTool, TRUSTED_SITES } from "./trust.ts";

/**
 * Records the site the user trusted on the step's card, once per conversation and origin.
 * The step itself is already completed, so nothing here fails the request: a tool whose
 * card offers no trust, a step outside a conversation and a failed write are logged, and the
 * next card simply offers the trust again.
 */
export async function recordCardTrust(
  serviceDb: ActionDb,
  action: OwnAction,
  origin: string,
): Promise<void> {
  const ignored = isTrustableTool(action.tool)
    ? null
    : `${action.tool} offers none`;
  try {
    const recorded =
      ignored === null && (await recordTrust(serviceDb, action, origin));
    if (!recorded) {
      console.warn(
        `[carmen-device-action] trust on action=${action.id} ignored: ${ignored ?? "no conversation"}`,
      );
    }
  } catch (error) {
    console.error(
      `[carmen-device-action] trust on action=${action.id} was not recorded`,
      error,
    );
  }
}

/**
 * Records that the user trusted `origin` for the action's conversation; false for a step
 * outside a conversation. A repeat leaves the first row.
 */
async function recordTrust(
  serviceDb: ActionDb,
  action: OwnAction,
  origin: string,
): Promise<boolean> {
  const conversationId = await actionConversation(serviceDb, action);
  if (!conversationId) {
    return false;
  }
  const { error } = await serviceDb.from(TRUSTED_SITES).upsert(
    {
      tenant_id: action.tenant_id,
      user_id: action.user_id,
      conversation_id: conversationId,
      origin,
    },
    {
      onConflict: "tenant_id,user_id,conversation_id,origin",
      ignoreDuplicates: true,
    },
  );
  if (error) {
    throw new Error(`recording the trusted site failed: ${error.message}`);
  }
  return true;
}
