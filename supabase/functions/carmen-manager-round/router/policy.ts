/**
 * Routing policy per finding kind: where the ladder starts, whether the
 * manager is told together with the campaigner, and whether it goes out at
 * once (within business hours) instead of waiting for the daily list.
 */
import type { FindingKind } from "../../_shared/manager-round/kinds.ts";

export type KindPolicy = {
  /** 0: campaigner first; 2: straight to the owner level (data and ops kinds). */
  start: 0 | 2;
  withManager: boolean;
  urgent: boolean;
};

const CAMPAIGNER: KindPolicy = { start: 0, withManager: false, urgent: false };
const CLIENT_WAITING: KindPolicy = {
  start: 0,
  withManager: true,
  urgent: true,
};
const OPS_OWNER: KindPolicy = { start: 2, withManager: false, urgent: false };

export const KIND_POLICY: Record<FindingKind, KindPolicy> = {
  cost_spike: CAMPAIGNER,
  roas_drop: CAMPAIGNER,
  kpi_exception: CAMPAIGNER,
  no_results_spend: CAMPAIGNER,
  platform_alert: CAMPAIGNER,
  data_gap: OPS_OWNER,
  reconcile_mismatch: OPS_OWNER,
  reconcile_missing_day: OPS_OWNER,
  unmapped_spend: OPS_OWNER,
  unanswered_request: CLIENT_WAITING,
  client_complaint: CLIENT_WAITING,
  contact_not_logged: CAMPAIGNER,
  no_contact: CAMPAIGNER,
  card_stale_group: CAMPAIGNER,
  unlinked_group: OPS_OWNER,
  no_campaigner: OPS_OWNER,
  missing_phone: OPS_OWNER,
};
