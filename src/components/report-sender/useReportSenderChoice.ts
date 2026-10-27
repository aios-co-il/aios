import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  pickReportSender,
  type ReportSenderPick,
} from "../../../supabase/functions/_shared/report-sender/pick.ts";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import { useReportSenders } from "./useReportSenders";

/** The resolved line for one send, or why there is none yet. */
export type ReportSenderChoicePick =
  ReportSenderPick<ReportSender> | { error: "loading" | "load_failed" };

export type ReportSenderChoice = {
  senders: ReportSender[];
  pick: ReportSenderChoicePick;
  choose: (integrationId: string) => void;
};

const NO_SENDERS: ReportSender[] = [];

/**
 * The line one send goes out from: the one picked in the dialog, else the
 * tenant default, else the tenant's only own line, else the sender's own
 * Green API line (the same order the server and the report worker use).
 */
export function useReportSenderChoice(
  tenantId: string | null | undefined,
): ReportSenderChoice {
  const { userId } = useCurrentUser();
  const { data, isPending, isError } = useReportSenders(tenantId);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const senders = data?.senders ?? NO_SENDERS;
  const resolved = pickReportSender({
    senders,
    requestedId: chosenId,
    tenantDefaultId: data?.tenantDefaultId,
    callerUserId: userId,
  });
  return {
    senders,
    pick: choicePick({ tenantId, isPending, isError }, resolved),
    choose: setChosenId,
  };
}

/** Loading and failed loads stay distinct from "no line". */
function choicePick(
  state: {
    tenantId: string | null | undefined;
    isPending: boolean;
    isError: boolean;
  },
  resolved: ReportSenderPick<ReportSender>,
): ReportSenderChoicePick {
  if (state.isError) {
    return { error: "load_failed" };
  }
  if (state.tenantId && state.isPending) {
    return { error: "loading" };
  }
  return resolved;
}
