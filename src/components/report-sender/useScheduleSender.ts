import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import {
  forScheduleCreator,
  resolveScheduleSender,
  type ScheduleCreatorView,
  type ScheduleSenderState,
  scheduleSenderToSave,
} from "./scheduleSender";
import { type ReportSenderOptions, useReportSenders } from "./useReportSenders";

export type ScheduleSenderField = {
  options: ReportSenderOptions | undefined;
  state: ScheduleSenderState;
  /** A line id, or null to follow the organization default. */
  choose: (integrationId: string | null) => void;
  /**
   * The id to store, or the Hebrew reason it cannot be saved: an enabled
   * WhatsApp schedule needs a line that can send.
   */
  toSave: (required: boolean) => { id: string | null } | { error: string };
};

/**
 * The "send from" field of a schedule form. `saved` is the stored schedule
 * (null for a new one): its NULL line follows the organization default; a
 * new schedule stores the line it resolves to unless the default is picked.
 * The line is resolved for the schedule's creator, whom the worker sends as.
 */
export function useScheduleSender(
  tenantId: string,
  saved:
    | { whatsapp_integration_id: string | null; created_by: string | null }
    | null
    | undefined,
): ScheduleSenderField {
  const { userId } = useCurrentUser();
  const { data, isError } = useReportSenders(tenantId);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const view = data && forScheduleCreator(data, userId ?? null, saved);
  const value =
    chosen === undefined ? (saved?.whatsapp_integration_id ?? null) : chosen;
  const state = fieldState(view, isError, {
    value,
    nullFollowsDefault: chosen === null || (chosen === undefined && !!saved),
  });
  return {
    options: view?.options,
    state,
    choose: setChosen,
    toSave: (required) => {
      const result = scheduleSenderToSave(state, value, {
        required,
        isNew: !saved,
      });
      return "error" in result
        ? { error: REPORT_SENDER_MESSAGES[result.error] }
        : result;
    },
  };
}

/** The resolved line once the lines are loaded. */
function fieldState(
  view: ScheduleCreatorView | undefined,
  isError: boolean,
  input: { value: string | null; nullFollowsDefault: boolean },
): ScheduleSenderState {
  if (isError) {
    return { status: "pending", error: "load_failed" };
  }
  if (!view) {
    return { status: "pending", error: "loading" };
  }
  return resolveScheduleSender({
    senders: view.options.senders,
    tenantDefaultId: view.options.tenantDefaultId,
    userId: view.creatorId,
    ...input,
  });
}
