import {
  isReportSenderType,
  type PickableSender,
  type ReportSenderType,
} from "./types.ts";

/** Why a line was chosen; stored with scheduled deliveries. */
export type ReportSenderSource =
  "requested" | "schedule" | "tenant_default" | "only_sender" | "own_line";

/**
 * Why no line was chosen:
 * - no_report_sender: the tenant has no ready Green API or Manus line;
 * - sender_not_allowed: the line named for this send or schedule is not one
 *   the tenant may use (or it is not ready), and such a line is never
 *   silently replaced;
 * - choose_sender: several lines and nothing says which one.
 */
export type ReportSenderError =
  "no_report_sender" | "sender_not_allowed" | "choose_sender";

export type ReportSenderPick<T extends PickableSender> =
  | { sender: T; type: ReportSenderType; source: ReportSenderSource }
  | { error: ReportSenderError };

export type PickReportSenderInput<T extends PickableSender> = {
  /** Lines from list_report_whatsapp_senders (own and shared). */
  senders: readonly T[];
  /** The line picked for this one send. */
  requestedId?: string | null;
  /** The schedule's own line. */
  scheduleSenderId?: string | null;
  /** tenant_report_settings.whatsapp_integration_id. */
  tenantDefaultId?: string | null;
  /** The person sending, or the schedule's creator. */
  callerUserId?: string | null;
};

/**
 * The line a report goes out from. Order: the line picked for this send, the
 * schedule's line, the tenant default, the tenant's only ready line, then the
 * caller's own Green API line (how reports were sent before lines could be
 * chosen). The tenant default is a preference: once its line is switched off
 * it is skipped, so a single ready line left still sends.
 */
export function pickReportSender<T extends PickableSender>(
  input: PickReportSenderInput<T>,
): ReportSenderPick<T> {
  const usable = input.senders.filter(isUsable);
  const named = namedSender(input);
  if (named) {
    const match = usable.find((sender) => sender.id === named.id);
    return match
      ? chosen(match, named.source)
      : { error: "sender_not_allowed" };
  }
  const tenantDefault = usableReportSender(usable, input.tenantDefaultId);
  if (tenantDefault) {
    return chosen(tenantDefault, "tenant_default");
  }
  if (usable.length === 0) {
    return { error: "no_report_sender" };
  }
  if (usable.length === 1) {
    return chosen(usable[0], "only_sender");
  }
  const own = usable.find(
    (sender) =>
      sender.integration_type === "green_api" &&
      !sender.is_shared &&
      !!input.callerUserId &&
      sender.owner_user_id === input.callerUserId,
  );
  return own ? chosen(own, "own_line") : { error: "choose_sender" };
}

/** The line with this id when it can send reports now, else null. */
export function usableReportSender<T extends PickableSender>(
  senders: readonly T[],
  id: string | null | undefined,
): T | null {
  if (!id) {
    return null;
  }
  return senders.find((sender) => sender.id === id && isUsable(sender)) ?? null;
}

/** Ready, and of a type that may send reports (never Meta Cloud). */
function isUsable(sender: PickableSender): boolean {
  return sender.ready && isReportSenderType(sender.integration_type);
}

/** The explicit choice for this send, else the schedule's own line. */
function namedSender(
  input: PickReportSenderInput<PickableSender>,
): { id: string; source: ReportSenderSource } | null {
  if (input.requestedId) {
    return { id: input.requestedId, source: "requested" };
  }
  if (input.scheduleSenderId) {
    return { id: input.scheduleSenderId, source: "schedule" };
  }
  return null;
}

/**
 * A pick result. The callers already filtered the type; checking it again
 * lets TypeScript narrow integration_type without a cast.
 */
function chosen<T extends PickableSender>(
  sender: T,
  source: ReportSenderSource,
): ReportSenderPick<T> {
  if (!isReportSenderType(sender.integration_type)) {
    return { error: "sender_not_allowed" };
  }
  return { sender, type: sender.integration_type, source };
}
