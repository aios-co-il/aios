import { z } from "npm:zod@3.25.76";
import type { Json } from "../_shared/database.types.ts";
import type { compareReportToMeta } from "../_shared/report-meta-verify.mjs";
import { jsonSchema } from "./run-request.ts";

/** Graph `me/adaccounts` entry field that MetaNode does not declare. */
const adAccountDisableReasonSchema = z
  .object({ disable_reason: z.unknown() })
  .catch({});

export function adAccountDisableReason(account: unknown): unknown {
  return adAccountDisableReasonSchema.parse(account).disable_reason;
}

/** `payload?.error?.message` for untrusted provider/HTTP JSON bodies. */
const providerErrorSchema = z
  .object({
    error: z.object({ message: z.unknown() }).catch({}),
  })
  .catch({ error: {} });

export function providerErrorMessage(payload: unknown): unknown {
  return providerErrorSchema.parse(payload).error.message;
}

/** Google Ads `googleAds:search` campaign row; leaves stay unknown until read. */
const googleAdsCampaignRowSchema = z
  .object({
    campaign: z
      .object({ id: z.unknown(), name: z.unknown(), status: z.unknown() })
      .catch({}),
    campaignBudget: z.object({ amountMicros: z.unknown() }).catch({}),
    metrics: z
      .object({
        costMicros: z.unknown(),
        clicks: z.unknown(),
        impressions: z.unknown(),
        conversions: z.unknown(),
      })
      .catch({}),
  })
  .catch({ campaign: {}, campaignBudget: {}, metrics: {} });

export type GoogleAdsCampaignRow = z.infer<typeof googleAdsCampaignRowSchema>;

export function readGoogleAdsCampaignRow(row: unknown): GoogleAdsCampaignRow {
  return googleAdsCampaignRowSchema.parse(row);
}

const calendarTimeSchema = z
  .object({ dateTime: z.unknown(), date: z.unknown() })
  .catch({});

/** Google Calendar `events.list` item; conference fields pass through for extractConferenceUrl. */
const googleCalendarEventSchema = z
  .object({
    id: z.unknown(),
    summary: z.unknown(),
    htmlLink: z.unknown(),
    start: calendarTimeSchema,
    end: calendarTimeSchema,
    attendees: z
      .array(z.object({ email: z.unknown() }).catch({}))
      .nullish()
      .catch(null),
  })
  .passthrough()
  .catch({ start: {}, end: {} });

export type GoogleCalendarEventItem = z.infer<typeof googleCalendarEventSchema>;

const googleCalendarEventsSchema = z
  .object({
    items: z.array(googleCalendarEventSchema).nullish().catch(null),
  })
  .catch({});

export function readGoogleCalendarEvents(
  payload: unknown,
): GoogleCalendarEventItem[] {
  return googleCalendarEventsSchema.parse(payload).items ?? [];
}

export type ReportMetaCheck = Partial<
  ReturnType<typeof compareReportToMeta>
> & {
  client: string | null;
  agency?: string | null;
  error?: string;
};

export interface AdAccountHealthIssue {
  client_id: string;
  client_name: string;
  agency_name: string | null;
  ad_account_id: Json | undefined;
  fb: {
    status: string;
    has_spend_7d: boolean;
    all_paused: boolean;
    token_ok: boolean;
  };
  flags: string[];
}

/** LLM-supplied `delegate_parallel` entry; only entries with a truthy title and prompt are kept. */
const parallelTaskArgSchema = z
  .object({
    title: z.unknown(),
    prompt: z.unknown(),
    task_skills: z.unknown(),
    side_effects: z.unknown(),
  })
  .refine((task) => Boolean(task.title) && Boolean(task.prompt));

export type ParallelTaskArg = z.infer<typeof parallelTaskArgSchema>;

export function parallelTaskArgs(items: unknown[]): ParallelTaskArg[] {
  return items.flatMap((item) => {
    const parsed = parallelTaskArgSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const automationStepArgSchema = z
  .object({
    type: z.unknown(),
    skin: z.unknown(),
    instruction: z.unknown(),
    action_type: z.unknown(),
    config: z.unknown(),
    label: z.unknown(),
  })
  .catch({});

export type AutomationStepArg = z.infer<typeof automationStepArgSchema>;

/** Reads an LLM-supplied automation step; null/undefined entries still fail like a property read did. */
export function automationStepArg(value: unknown): AutomationStepArg {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading 'type')`);
  }
  return automationStepArgSchema.parse(value);
}

/** A step's JSON object or array config; anything else is `{}`. */
const automationStepConfigSchema = z
  .union([z.record(jsonSchema), z.array(jsonSchema)])
  .catch({});

export function automationStepConfig(config: unknown): Json {
  return automationStepConfigSchema.parse(config);
}
