import {
  pickReportSender,
  usableReportSender,
} from "../../../supabase/functions/_shared/report-sender/pick.ts";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import {
  pickErrorKey,
  type ReportSenderMessageKey,
} from "./reportSenderMessages";

/**
 * A schedule's line as its form shows it:
 * - follows_default: NULL, chosen to follow the organization default;
 * - line: a concrete line, stored by id so it never moves on its own;
 * - unusable: the stored line is gone or cannot send;
 * - none: no line resolves (no phone at all, no own line to take, or an
 *   organization default that can no longer send).
 */
export type ScheduleSender =
  | { status: "follows_default"; sender: ReportSender }
  | { status: "line"; sender: ReportSender }
  | {
      status: "unusable";
      savedId: string;
      error: "sender_not_allowed" | "not_configured";
    }
  | {
      status: "none";
      error:
        | "no_report_sender"
        | "choose_sender"
        | "sender_not_allowed"
        | "stale_default";
    };

/** The form's line, or that the lines are still loading or failed to. */
export type ScheduleSenderState =
  ScheduleSender | { status: "pending"; error: "loading" | "load_failed" };

export type ScheduleSenderInput = {
  senders: readonly ReportSender[];
  tenantDefaultId: string | null;
  /** The person saving, who becomes the schedule's creator. */
  userId: string | null;
  /** The line in the form: the stored one, or the one just picked. */
  value: string | null;
  /** A NULL value was stored or picked to follow the organization default. */
  nullFollowsDefault: boolean;
};

/**
 * Resolves the form's line the way the report worker would. A NULL line
 * follows the default only when someone chose that and there is a real
 * choice; otherwise the line it resolves to is shown and stored.
 */
export function resolveScheduleSender(
  input: ScheduleSenderInput,
): ScheduleSender {
  if (input.value) {
    return storedLine(input.senders, input.value);
  }
  const pick = pickReportSender({
    senders: input.senders,
    tenantDefaultId: input.tenantDefaultId,
    callerUserId: input.userId,
  });
  if ("error" in pick) {
    return { status: "none", error: pickErrorKey(pick) };
  }
  const followsDefault =
    input.nullFollowsDefault &&
    pick.source === "tenant_default" &&
    input.senders.filter((sender) => sender.ready).length > 1;
  return followsDefault
    ? { status: "follows_default", sender: pick.sender }
    : { status: "line", sender: pick.sender };
}

/**
 * The line id to store, or why an enabled WhatsApp schedule cannot be saved.
 * A schedule that is off, or sends no WhatsApp, keeps what it has.
 */
export function scheduleSenderToSave(
  state: ScheduleSenderState,
  value: string | null,
  required: boolean,
): { id: string | null } | { error: ReportSenderMessageKey } {
  if (state.status === "follows_default") {
    return { id: null };
  }
  if (state.status === "line") {
    return { id: state.sender.id };
  }
  return required ? { error: state.error } : { id: value };
}

/** A stored line, checked by the same rule as the worker. */
function storedLine(
  senders: readonly ReportSender[],
  id: string,
): ScheduleSender {
  const sender = usableReportSender(senders, id);
  if (sender) {
    return { status: "line", sender };
  }
  const listed = senders.some((candidate) => candidate.id === id);
  return {
    status: "unusable",
    savedId: id,
    error: listed ? "not_configured" : "sender_not_allowed",
  };
}
