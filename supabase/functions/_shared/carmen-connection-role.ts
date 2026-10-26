// Carmen's WhatsApp connection roles (primary / secondary / none) and the
// gate for secondary connections. Pure helpers shared by the webhooks and
// covered by carmen-connection-role.test.ts.
//
// primary   — Carmen's own phone: full Carmen behaviour, system notifications.
// secondary — e.g. the owner's personal phone: Carmen only wakes for a message
//             that contains the trigger word, through an automation pinned to
//             THIS connection, and never sends system notifications.
// none      — Carmen never answers on this connection.

export type CarmenConnectionRole = "primary" | "secondary" | "none";

export const CARMEN_INSTRUCTIONS_MAX_CHARS = 2000;

/**
 * Role of a connection. An explicit settings.carmen_role wins. Otherwise Manus
 * is primary; any other provider is primary only when the tenant has no
 * active Manus connection (today's behaviour), else secondary.
 */
export function resolveCarmenConnectionRole(
  integration: { integration_type?: string | null; settings?: unknown } | null,
  opts: { tenantHasActiveManus: boolean },
): CarmenConnectionRole {
  const settings = integration?.settings;
  const explicit =
    typeof settings === "object" &&
    settings !== null &&
    "carmen_role" in settings
      ? settings.carmen_role
      : undefined;
  if (explicit === "primary" || explicit === "secondary" || explicit === "none")
    return explicit;
  if (integration?.integration_type === "manus_wa") return "primary";
  return opts.tenantHasActiveManus ? "secondary" : "primary";
}

export type SecondaryGateInput = {
  isIncoming: boolean;
  isManualOutgoing: boolean;
  isGroup: boolean;
  /** Trigger word present as a direct address in this message. */
  hasTrigger: boolean;
  /** The automation's carmen_integration_id. */
  pinnedIntegrationId: string | null | undefined;
  integrationId: string | null | undefined;
  /** carmen_scope_mode of the automation. */
  scopeMode: string | null | undefined;
};

export type SecondaryGateResult =
  | { allow: true }
  | {
      allow: false;
      reason:
        | "not_pinned_to_connection"
        | "group_on_secondary"
        | "no_trigger"
        | "incoming_requires_phone_scope";
    };

/**
 * Fail-closed gate for secondary connections. Every condition must hold:
 * the automation is pinned to THIS connection, the chat is private, the
 * message carries the trigger word (no trigger-less session continuation),
 * and messages from other people only count when the automation is limited
 * to specific phones (its allow-list is checked by the normal scope logic).
 */
export function secondaryCarmenGate(
  input: SecondaryGateInput,
): SecondaryGateResult {
  if (!input.integrationId || input.pinnedIntegrationId !== input.integrationId)
    return { allow: false, reason: "not_pinned_to_connection" };
  if (input.isGroup) return { allow: false, reason: "group_on_secondary" };
  if (!input.hasTrigger) return { allow: false, reason: "no_trigger" };
  if (input.isIncoming && !input.isManualOutgoing) {
    if (input.scopeMode !== "specific_phone")
      return { allow: false, reason: "incoming_requires_phone_scope" };
  }
  return { allow: true };
}

// Control chars (except \t \n \r) and bidi overrides, built from code points
// so the source holds no literal control characters (no-control-regex).
const BIDI_AND_CONTROL_RE = new RegExp(
  "[" +
    [
      [0x00, 0x08],
      [0x0b, 0x0c],
      [0x0e, 0x1f],
      [0x7f, 0x7f],
      [0x202a, 0x202e],
      [0x2066, 0x2069],
    ]
      .map(
        ([a, b]) =>
          `\\u${a.toString(16).padStart(4, "0")}-\\u${b.toString(16).padStart(4, "0")}`,
      )
      .join("") +
    "]",
  "g",
);

/**
 * Admin-authored per-automation instructions, bounded and stripped of
 * control characters and prompt-section markers before they reach the model.
 */
export function sanitizeCarmenInstructions(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(BIDI_AND_CONTROL_RE, "")
    .replace(/<<<|>>>/g, "")
    .split("\n")
    .filter((line) => !/^\s*===/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, CARMEN_INSTRUCTIONS_MAX_CHARS)
    .trim();
  return cleaned || null;
}

export type CarmenAutomationContext = {
  automation_id: string;
  carmen_instructions: string | null;
};

export function buildCarmenAutomationContext(
  automationId: string | null | undefined,
  cfg: unknown,
): CarmenAutomationContext | null {
  if (!automationId) return null;
  const instructions =
    typeof cfg === "object" && cfg !== null && "carmen_instructions" in cfg
      ? cfg.carmen_instructions
      : undefined;
  return {
    automation_id: automationId,
    carmen_instructions: sanitizeCarmenInstructions(instructions),
  };
}

/** System-prompt block for per-automation instructions (empty when none). */
export function automationInstructionsBlock(
  instructions: string | null,
): string {
  if (!instructions) return "";
  return `\n\n=== הנחיות לשיחה זו (מוגדרות באוטומציה ע״י מנהל המערכת) ===\n${instructions}\nההנחיות האלה חלות רק על השיחה הזו. הן לא מבטלות את כללי האישור, ההרשאות והבטיחות.`;
}
