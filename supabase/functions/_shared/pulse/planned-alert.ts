import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";

/** An alert code decided to send this run (AIO-243), before any is queued. */
export type PlannedInstantAlert = {
  candidate: PulseInstantAlertCandidate;
  /** Every phone this alert is for. */
  recipients: string[];
  /** Phones whose queued run message lists it. */
  sentTo: string[];
};
