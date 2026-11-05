/**
 * The per-person part of the Sunday pulse: each campaigner and team manager
 * gets a digest of their own clients, previewed first on the tenant's preview
 * phone when it has one. Whoever gets the full digest (deliverReportDigest)
 * is skipped, so nobody gets both.
 */

import {
  buildPulseWhatsAppDigest,
  isPulseDeliveryExcludedPhone,
} from "../_shared/campaign-pulse.ts";
import { normalizeNotifyPhone } from "../_shared/carmen-notify-target.ts";
import {
  buildPulsePreviewMessage,
  scopeSnapshotsForPlan,
  type PulseDeliveryPlan,
} from "../_shared/pulse-delivery.ts";
import type { ReportDigestResult } from "./report-digest.ts";

/** Queues each plan's scoped digest and its preview; a preview run sends only previews. */
export async function deliverScopedPulseRecipients(input: {
  plans: PulseDeliveryPlan[];
  snapshots: PulseSnapshot[];
  dashboardUrl: string;
  tenantSlug: string;
  previewPhone: string | null;
  previewOnly: boolean;
  reportDigest: Pick<ReportDigestResult, "getsDigest">;
  queue: (message: string, phone: string) => Promise<boolean>;
}): Promise<ScopedPulseDelivery[]> {
  const previewTarget = isPulseDeliveryExcludedPhone(
    input.previewPhone,
    input.tenantSlug,
  )
    ? null
    : input.previewPhone;
  const deliveries: ScopedPulseDelivery[] = [];
  for (const plan of input.plans) {
    const recipientPhone = normalizeNotifyPhone(plan.phone);
    if (
      !recipientPhone ||
      input.reportDigest.getsDigest.has(recipientPhone) ||
      isPulseDeliveryExcludedPhone(recipientPhone, input.tenantSlug)
    ) {
      continue;
    }
    const scoped = scopeSnapshotsForPlan(input.snapshots, plan);
    if (!scoped.length) {
      continue;
    }
    const scopedDigest = buildPulseWhatsAppDigest(scoped, input.dashboardUrl);
    if (previewTarget) {
      const previewQueued = await input.queue(
        buildPulsePreviewMessage(plan.name, scopedDigest),
        previewTarget,
      );
      deliveries.push({
        type: "preview",
        recipient: plan.name,
        role: plan.role,
        preview_phone: previewTarget,
        clients: scoped.length,
        queued: previewQueued,
      });
    }
    if (input.previewOnly) {
      continue;
    }
    const queued = await input.queue(scopedDigest, recipientPhone);
    deliveries.push({
      type: plan.role,
      recipient: plan.name,
      phone: recipientPhone,
      clients: scoped.length,
      queued,
    });
  }
  return deliveries;
}

/** A campaign_pulse_snapshots row, as far as the scoped digest reads it. */
type PulseSnapshot = Parameters<typeof buildPulseWhatsAppDigest>[0][number] & {
  client_id: string;
};

export type ScopedPulseDelivery =
  | {
      type: "preview";
      recipient: string;
      role: PulseDeliveryPlan["role"];
      preview_phone: string;
      clients: number;
      queued: boolean;
    }
  | {
      type: PulseDeliveryPlan["role"];
      recipient: string;
      phone: string;
      clients: number;
      queued: boolean;
    };
