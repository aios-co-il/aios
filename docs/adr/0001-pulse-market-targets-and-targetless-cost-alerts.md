---
status: accepted
date: 2026-10-26
---

# Pulse: Carmen's market targets and cost alerts without a target

`docs/carmen-reliability-plan.md` ("דיוק היעד", lines 30-56) let only an approved target raise a pulse alert, told Carmen never to invent a market price ("אין להמציא מחיר שוק"), and showed a trend only when a client had no target. Most clients have no approved target, so rising CPL/CPA and falling ROAS went unflagged. On 26.10.2026 David revised that rule (AIO-236):

1. **Cost flags without a target.** A campaign with no target of any source is an exception when its CPL/CPA rose by at least 40% on both the 3-day and the 7-day window against the 28-day baseline (or its ROAS fell by at least 25% on both), it spent at least 300 in the last 7 full days (table currency, as-is), and the baseline has at least 3 outcomes over at least 14 spending days. The thresholds live in `supabase/functions/_shared/pulse-cost-rules.mjs`, with per-tenant overrides in `pulse_alert_rules.manager.cost`. The snapshot and the pulse dashboard build campaign rows with the same module and the same tenant rules, so a red dashboard cell means a WhatsApp alert is due. The dashboard no longer shows the 30-day baseline as a "target".
2. **Carmen's market target.** Carmen may set a target with `source: "carmen_market"` (`set_market_target`), based on the client's vertical benchmarks in the Israeli market and on the client's own history, and the stored rationale must state both. She may do so only where no approved target applies and can never overwrite one. A market target alerts immediately, like an approved target, and every status reason and alert names it as "יעד שוק (כרמן)". A person replaces it by saving an approved target (dashboard target editor, or `set_pulse_target` through `agent_approval_queue`).

## Consequences

- WhatsApp alerts for campaigns without a target ship off (`manager.cost.target_less_alerts: false`): the deploy must not send one alert for every campaign that already trends badly. Until a tenant owner turns them on in the pulse rules dialog, the dashboard and the snapshot mark these campaigns as exceptions "בלי התראה". Market targets need no switch, because none exist before the feature.
- Recipients do not change in this step: the instant-alert path still sends to the owner and the team managers. Routing to campaigners belongs to the manager round.
- Engagement campaigns (cost per result) without a target stay at watch.
