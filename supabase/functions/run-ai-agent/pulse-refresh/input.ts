import { asUuidOrNull } from "../../_shared/uuid.ts";

/** Who asks for the refresh, for which tenant, and optionally which client. */
export type PulseRefreshInput = {
  tenantId: string | null | undefined;
  /** The tool's client_id argument as the model sent it; checked here. */
  clientId?: unknown;
  surface?: string | null;
  callerCampaignerId?: string | null;
  callerUserId?: string | null;
};

/** What the tool returns instead of the pulse when it refuses. */
export type PulseRefreshRefusal = { error: string; message: string };

/**
 * Checks the caller, the tenant and the optional client before anything runs.
 * Returns a refusal, or the tenant uuid to refresh.
 */
export async function checkRefreshInput(
  input: PulseRefreshInput,
  assertClientVisible: (clientId: string) => Promise<void>,
): Promise<PulseRefreshRefusal | { tenantId: string }> {
  const refusal = pulseRefreshCallerRefusal(input);
  if (refusal) {
    return refusal;
  }
  const tenantId = asUuidOrNull(input.tenantId);
  if (!tenantId) {
    return {
      error: "tenant_required",
      message: "לא זוהה ארגון, ולכן אי אפשר לרענן את הדופק.",
    };
  }
  const clientRefusal = await checkClient(input.clientId, assertClientVisible);
  return clientRefusal ?? { tenantId };
}

/**
 * WhatsApp senders and task runs that run-ai-agent could not tie to staff
 * (client contacts in a client group, unknown numbers, tasks they created)
 * have no campaigner and no user, so the pulse would not be scoped to them.
 * They may not trigger a refresh of the whole tenant.
 */
export function pulseRefreshCallerRefusal(
  caller: PulseCallerIdentity = {},
): PulseRefreshRefusal | null {
  if (isUnidentifiedPulseCaller(caller)) {
    return {
      error: "caller_not_identified",
      message: "רענון הדופק זמין רק לאנשי צוות שמזוהים במערכת.",
    };
  }
  return null;
}

/** The turn's surface and the caller run-ai-agent resolved for it. */
export type PulseCallerIdentity = Pick<
  PulseRefreshInput,
  "surface" | "callerCampaignerId" | "callerUserId"
>;

/** A WhatsApp or task turn with no campaigner and no user behind it. */
export function isUnidentifiedPulseCaller({
  surface,
  callerCampaignerId,
  callerUserId,
}: PulseCallerIdentity = {}): boolean {
  return (
    UNVERIFIED_CALLER_SURFACES.has(surface ?? "") &&
    !callerCampaignerId &&
    !callerUserId
  );
}

/** A client_id must be a uuid the caller may see; no client means the whole tenant. */
async function checkClient(
  clientId: unknown,
  assertClientVisible: (clientId: string) => Promise<void>,
): Promise<PulseRefreshRefusal | null> {
  const text = typeof clientId === "string" ? clientId.trim() : clientId;
  if (text == null || text === "") {
    return null;
  }
  const id = typeof text === "string" ? asUuidOrNull(text) : null;
  if (!id) {
    return {
      error: "invalid_client_id",
      message:
        "client_id לא תקין. אפשר לחפש לקוח לפי שם עם client_name, או לרענן בלי לקוח.",
    };
  }
  try {
    await assertClientVisible(id);
    return null;
  } catch (error) {
    return {
      error: "client_not_accessible",
      message:
        (error instanceof Error && error.message) ||
        "הלקוח לא נמצא או מחוץ להרשאה שלך.",
    };
  }
}

// Surfaces whose turn is not bound to a signed-in user: a WhatsApp sender, or a
// task that runs as its creator ("system" when a WhatsApp group contact or an
// automation created it).
const UNVERIFIED_CALLER_SURFACES = new Set(["whatsapp", "task"]);
