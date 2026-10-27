// Who may log client contact through Carmen (AIO-232). A call or meeting on
// the client card must be vouched for by a person talking to Carmen right now;
// that person owns the entry. Reused by later contact-logging paths (C19).

import { asUuidOrNull } from "./uuid.mjs";
import {
  CARMEN_CLIENT_UPDATE_TYPES,
  CONTACT_UPDATE_TYPES,
  isCarmenClientUpdateType,
  type CarmenClientUpdateType,
  type ClientCardSource,
} from "./client-card-sources.ts";

// Surfaces where a person is talking to Carmen right now. Scheduled tasks,
// automations, other agents (grok_bot, agent_direct) and heartbeat runs have
// nobody who can confirm that a call took place.
const HUMAN_REQUEST_SURFACES = new Set(["whatsapp", "aios", "internal_chat"]);

export function resolveHumanRequesterUserId(input: {
  userId?: string | null;
  surface?: string | null;
  automationId?: string | null;
}): string | null {
  if (input.automationId) return null;
  if (!input.surface || !HUMAN_REQUEST_SURFACES.has(input.surface)) return null;
  return asUuidOrNull(input.userId);
}

export const HUMAN_REQUESTER_REQUIRED_HE =
  "שיחה או פגישה נרשמות בכרטיס הלקוח רק כשאיש צוות מבקש ממך לתעד אותן, והן נרשמות על שמו. בריצה הזאת אין איש צוות שמאשר שהקשר התקיים, ולכן לא נרשם דבר. אפשר לרשום הערה (note), או לבקש מהקמפיינר לתעד את השיחה.";

export type CarmenClientUpdatePlan =
  | {
      ok: true;
      updateType: CarmenClientUpdateType;
      source: ClientCardSource;
      attributedUserId: string | null;
      countsAsContact: boolean | null;
    }
  | { ok: false; error: string; message: string };

/**
 * Decide how Carmen's add_client_update is written.
 * - With a person asking: source carmen_confirmed, attributed to that person;
 *   a call or meeting is flagged counts_as_contact.
 * - Without one: source carmen (author falls back to campaigner, then owner),
 *   and a call or meeting is refused — nobody can vouch for it.
 */
export function planCarmenClientUpdate(input: {
  updateType?: unknown;
  humanRequesterUserId?: string | null;
}): CarmenClientUpdatePlan {
  const raw =
    typeof input.updateType === "string"
      ? input.updateType.trim().toLowerCase()
      : "";
  const updateType = raw || "note";
  if (!isCarmenClientUpdateType(updateType))
    return {
      ok: false,
      error: "invalid_update_type",
      message: `סוג עדכון לא מוכר: ${raw}. אפשר: ${CARMEN_CLIENT_UPDATE_TYPES.join(", ")}`,
    };
  const requester = asUuidOrNull(input.humanRequesterUserId);
  const isContact = CONTACT_UPDATE_TYPES.includes(updateType);
  if (isContact && !requester)
    return {
      ok: false,
      error: "human_requester_required",
      message: HUMAN_REQUESTER_REQUIRED_HE,
    };
  if (requester)
    return {
      ok: true,
      updateType,
      source: "carmen_confirmed",
      attributedUserId: requester,
      countsAsContact: isContact ? true : null,
    };
  return {
    ok: true,
    updateType,
    source: "carmen",
    attributedUserId: null,
    countsAsContact: null,
  };
}
