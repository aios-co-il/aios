import {
  isReportSenderType,
  type PickableSender,
  type ReportSenderType,
} from "./types.ts";

/** Why a line was chosen; stored with scheduled deliveries. */
export type ReportSenderSource =
  "requested" | "schedule" | "tenant_default" | "only_sender" | "own_line";

/** A line someone chose: for this send, for the schedule, or as the default. */
export type NamedSenderSource = Extract<
  ReportSenderSource,
  "requested" | "schedule" | "tenant_default"
>;

/**
 * Why no line was chosen:
 * - no_report_sender: the tenant has no ready Green API or Manus line the
 *   caller may use;
 * - sender_not_allowed: the line someone chose (`refused` says where) is not
 *   one the caller may use for the tenant, or it is not ready, and a chosen
 *   line is never silently replaced;
 * - choose_sender: no line of the tenant's own resolves (several, or only
 *   lines shared by other tenants) and nothing says which one.
 */
export type ReportSenderError =
  "no_report_sender" | "sender_not_allowed" | "choose_sender";

export type ReportSenderPick<T extends PickableSender> =
  | { sender: T; type: ReportSenderType; source: ReportSenderSource }
  | { error: "sender_not_allowed"; refused: NamedSenderSource }
  | { error: Exclude<ReportSenderError, "sender_not_allowed"> };

export type PickReportSenderInput<T extends PickableSender> = {
  /**
   * Lines from list_report_whatsapp_senders for the caller (own and shared),
   * so another member's private line is never among them.
   */
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

/** A line that can send reports now, its type narrowed. */
type UsableSender<T extends PickableSender> = T & {
  integration_type: ReportSenderType;
};

/**
 * The line a report goes out from. A chosen line comes first: the one picked
 * for this send, the schedule's line, then the tenant default. A chosen line
 * that cannot send fails the pick, the default included, until someone picks
 * another. Without a choice: the only ready line of the tenant's own that the
 * caller may use, then the caller's own Green API line (how reports were sent
 * before lines could be chosen). A line shared by another tenant is never
 * picked on its own: any owner can share a line into any tenant unasked
 * (AIO-245).
 */
export function pickReportSender<T extends PickableSender>(
  input: PickReportSenderInput<T>,
): ReportSenderPick<T> {
  const usable = usableReportSenders(input.senders);
  const named = namedSender(input);
  if (named) {
    const match = usable.find((sender) => sender.id === named.id);
    return match
      ? chosen(match, named.source)
      : { error: "sender_not_allowed", refused: named.source };
  }
  if (usable.length === 0) {
    return { error: "no_report_sender" };
  }
  const owned = usable.filter((sender) => !sender.is_shared);
  if (owned.length === 1) {
    return chosen(owned[0], "only_sender");
  }
  const own = owned.find(
    (sender) =>
      sender.integration_type === "green_api" &&
      !!input.callerUserId &&
      sender.owner_user_id === input.callerUserId,
  );
  return own ? chosen(own, "own_line") : { error: "choose_sender" };
}

/** The lines that can send reports now. */
export function usableReportSenders<T extends PickableSender>(
  senders: readonly T[],
): UsableSender<T>[] {
  return senders.filter(isUsable);
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
function isUsable<T extends PickableSender>(
  sender: T,
): sender is UsableSender<T> {
  return sender.ready && isReportSenderType(sender.integration_type);
}

/** The choice for this send, else the schedule's line, else the default. */
function namedSender(
  input: PickReportSenderInput<PickableSender>,
): { id: string; source: NamedSenderSource } | null {
  if (input.requestedId) {
    return { id: input.requestedId, source: "requested" };
  }
  if (input.scheduleSenderId) {
    return { id: input.scheduleSenderId, source: "schedule" };
  }
  if (input.tenantDefaultId) {
    return { id: input.tenantDefaultId, source: "tenant_default" };
  }
  return null;
}

/** A pick result for a usable line. */
function chosen<T extends PickableSender>(
  sender: UsableSender<T>,
  source: ReportSenderSource,
): ReportSenderPick<T> {
  return { sender, type: sender.integration_type, source };
}
