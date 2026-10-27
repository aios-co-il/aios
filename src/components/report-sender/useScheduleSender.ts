import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import {
  resolveScheduleSender,
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
 */
export function useScheduleSender(
  tenantId: string,
  saved: { whatsapp_integration_id: string | null } | null | undefined,
): ScheduleSenderField {
  const { userId } = useCurrentUser();
  const { data, isError } = useReportSenders(tenantId);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const value =
    chosen === undefined ? (saved?.whatsapp_integration_id ?? null) : chosen;
  const state = fieldState(data, isError, {
    userId: userId ?? null,
    value,
    nullFollowsDefault: chosen === null || (chosen === undefined && !!saved),
  });
  return {
    options: data,
    state,
    choose: setChosen,
    toSave: (required) => {
      const result = scheduleSenderToSave(state, value, required);
      return "error" in result
        ? { error: REPORT_SENDER_MESSAGES[result.error] }
        : result;
    },
  };
}

/** The resolved line once the lines are loaded. */
function fieldState(
  data: ReportSenderOptions | undefined,
  isError: boolean,
  input: {
    userId: string | null;
    value: string | null;
    nullFollowsDefault: boolean;
  },
): ScheduleSenderState {
  if (isError) {
    return { status: "pending", error: "load_failed" };
  }
  if (!data) {
    return { status: "pending", error: "loading" };
  }
  return resolveScheduleSender({
    senders: data.senders,
    tenantDefaultId: data.tenantDefaultId,
    ...input,
  });
}
