import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";

/** An alert code decided to send this run (AIO-243), before any is queued. */
export type PlannedInstantAlert = {
  candidate: PulseInstantAlertCandidate;
  /** Every phone this alert is for. */
  recipients: string[];
  /** Phones that get this alert as its own message (the rest: a summary). */
  individual: string[];
  /** Phones its own message was queued to. */
  sentTo: string[];
  /** Phones whose queued summary message lists it. */
  summarizedTo: string[];
};
