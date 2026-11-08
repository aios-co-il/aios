import { automationStepConfigurationSchema } from "./automation-step-configuration.ts";
import { z } from "npm:zod@3.25.76";

const optionalText = z.string().optional().catch(undefined);
const optionalMetric = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .optional()
  .catch(undefined);

/** Graph `me/adaccounts` entry field that MetaNode does not declare. */
const adAccountDisableReasonSchema = z
  .object({ disable_reason: z.number().optional().catch(undefined) })
  .catch({});

/** Read a supported disable reason from a provider account record. */
export function adAccountDisableReason(account: unknown): number | undefined {
  return adAccountDisableReasonSchema.parse(account).disable_reason;
}

/** `payload?.error?.message` for untrusted provider/HTTP JSON bodies. */
const providerErrorSchema = z
  .object({
    error: z.object({ message: optionalText }).catch({}),
  })
  .catch({ error: {} });

/** Extract a readable provider error without trusting its response shape. */
export function providerErrorMessage(payload: unknown): string | undefined {
  return providerErrorSchema.parse(payload).error.message;
}

/** Google Ads `googleAds:search` campaign row with validated identifiers and numeric metrics. */
const googleAdsCampaignRowSchema = z
  .object({
    campaign: z
      .object({ id: optionalText, name: optionalText, status: optionalText })
      .catch({}),
    campaignBudget: z.object({ amountMicros: optionalMetric }).catch({}),
    metrics: z
      .object({
        costMicros: optionalMetric,
        clicks: optionalMetric,
        impressions: optionalMetric,
        conversions: optionalMetric,
      })
      .catch({}),
  })
  .catch({ campaign: {}, campaignBudget: {}, metrics: {} });

export type GoogleAdsCampaignRow = z.infer<typeof googleAdsCampaignRowSchema>;

/** Validate the campaign fields consumed by the Google Ads tool. */
export function readGoogleAdsCampaignRow(row: unknown): GoogleAdsCampaignRow {
  return googleAdsCampaignRowSchema.parse(row);
}

const calendarTimeSchema = z
  .object({ dateTime: optionalText, date: optionalText })
  .catch({});

/** Google Calendar `events.list` item; conference fields pass through for extractConferenceUrl. */
const googleCalendarEventSchema = z
  .object({
    id: optionalText,
    summary: optionalText,
    htmlLink: optionalText,
    start: calendarTimeSchema,
    end: calendarTimeSchema,
    attendees: z
      .array(z.object({ email: optionalText }).catch({}))
      .nullish()
      .catch(null),
  })
  .extend({
    hangoutLink: optionalText,
    description: optionalText,
    location: optionalText,
    conferenceData: z
      .object({
        entryPoints: z.array(z.object({ uri: optionalText })).optional(),
      })
      .optional()
      .catch(undefined),
  })
  .catch({ start: {}, end: {} });

export type GoogleCalendarEventItem = z.infer<typeof googleCalendarEventSchema>;

const googleCalendarEventsSchema = z
  .object({
    items: z.array(googleCalendarEventSchema).nullish().catch(null),
  })
  .catch({});

/** Validate Calendar event entries independently at the provider boundary. */
export function readGoogleCalendarEvents(
  payload: unknown,
): GoogleCalendarEventItem[] {
  return googleCalendarEventsSchema.parse(payload).items ?? [];
}

export interface AdAccountHealthIssue {
  client_id: string;
  client_name: string;
  agency_name: string | null;
  ad_account_id: string | number | null | undefined;
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
    title: z.string().min(1),
    prompt: z.string().min(1),
    task_skills: z.array(z.string()).optional().catch(undefined),
    side_effects: z.boolean().optional().catch(undefined),
  })
  .refine((task) => Boolean(task.title) && Boolean(task.prompt));

export type ParallelTaskArg = z.infer<typeof parallelTaskArgSchema>;

/** Validate the titled task entries passed to parallel execution. */
export function parallelTaskArgs(items: unknown[]): ParallelTaskArg[] {
  return items.flatMap((item) => {
    const parsed = parallelTaskArgSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const automationStepArgSchema = z.object({
  type: optionalText,
  skin: optionalText,
  instruction: optionalText,
  action_type: optionalText,
  config: automationStepConfigurationSchema.optional(),
  label: optionalText,
});

export type AutomationStepArg = z.infer<typeof automationStepArgSchema>;

/** Reads an LLM-supplied automation step; null/undefined entries still fail like a property read did. */
export function automationStepArg(value: unknown): AutomationStepArg {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading 'type')`);
  }
  return automationStepArgSchema.parse(value);
}

export function readField(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" && key in value
    ? Reflect.get(value, key)
    : undefined;
}

/** A Meta ad account identifier from stored integration settings. */
export function readAdAccountId(value: unknown): string | number | undefined {
  const parsed = z.union([z.string(), z.number()]).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
