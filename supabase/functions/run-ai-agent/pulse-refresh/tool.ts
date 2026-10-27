import { REFRESH_PULSE_TOOL_NAME } from "../../_shared/carmen/pulse-tools.ts";
import {
  createPulseRefreshDeps,
  type PulseRefreshDepsOptions,
} from "./deps.ts";
import type { PulseRefreshRefusal } from "./input.ts";
import type { PulsePayload } from "./result.ts";
import { runCampaignPulseRefresh } from "./run.ts";
import { PULSE_REFRESH_MIN_INTERVAL_SECONDS } from "./snapshot.ts";

/** refresh_campaign_pulse as run-ai-agent offers it to the model. */
export const REFRESH_CAMPAIGN_PULSE_TOOL = {
  name: REFRESH_PULSE_TOOL_NAME,
  description: `רענון בדיקת הדופק: מחשב מחדש את הדופק של הארגון מהנתונים שכבר סונכרנו ומחזיר אותו כמו get_latest_campaign_pulse, עם refresh_note. לא שולח הודעות ולא מריץ סנכרון מול Meta או Google. מרענן לכל היותר פעם ב-${PULSE_REFRESH_MIN_INTERVAL_SECONDS / 60} דקות לארגון; אחרת מחזיר את הבדיקה הקיימת. לבקשות כמו "רענני דופק", "דופק עדכני", "בדיקת דופק מלאה ועדכנית".`,
  parameters: {
    type: "object",
    properties: {
      client_id: {
        type: "string",
        description: "לקוח אחד (רק לקוח שמותר למשתמש לראות)",
      },
      client_name: { type: "string", description: "חיפוש חלקי בשם הלקוח" },
    },
  },
};

/** What refresh_campaign_pulse needs from executeTool. */
export type RefreshPulseContext = {
  args: Record<string, unknown>;
  supabase: PulseRefreshDepsOptions["supabase"];
  tenantId: string;
  surface?: string | null;
  callerCampaignerId?: string | null;
  /** The caller's user uuid, or null for "system" and WhatsApp senders. */
  actorUserId: string | null;
  accessibleTenantIds: string[];
  assertCallerCanAccessClient: (clientId: string) => Promise<unknown>;
  supabaseUrl?: string | null;
  serviceKey?: string | null;
};

/** get_latest_campaign_pulse's filters for the same client. */
type PulseArgs = { client_id: unknown; client_name: unknown };

/**
 * Runs refresh_campaign_pulse: recomputes this tenant's snapshot (no digest,
 * no instant alerts, rate-limited), then answers like get_latest_campaign_pulse
 * through loadPulse.
 */
export function executeRefreshCampaignPulse(
  ctx: RefreshPulseContext,
  loadPulse: (args: PulseArgs) => Promise<PulsePayload | null>,
): Promise<PulseRefreshRefusal | PulsePayload> {
  const { args } = ctx;
  const pulseArgs: PulseArgs = {
    client_id: args.client_id || undefined,
    client_name: args.client_name || undefined,
  };
  return runCampaignPulseRefresh(
    {
      tenantId: ctx.tenantId,
      clientId: args.client_id,
      surface: ctx.surface,
      callerCampaignerId: ctx.callerCampaignerId,
      callerUserId: ctx.actorUserId,
    },
    {
      ...createPulseRefreshDeps({
        supabase: ctx.supabase,
        tenantId: ctx.tenantId,
        accessibleTenantIds: ctx.accessibleTenantIds,
        assertCallerCanAccessClient: ctx.assertCallerCanAccessClient,
        requestedBy: ctx.actorUserId,
        supabaseUrl: ctx.supabaseUrl,
        serviceKey: ctx.serviceKey,
      }),
      loadPulse: () => loadPulse(pulseArgs),
    },
  );
}
