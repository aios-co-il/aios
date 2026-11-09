import { invalidToolInput } from "./tool-input-errors.ts";
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

/** Read the Meta disable reason, returning undefined for malformed fields. */
export function adAccountDisableReason(account: unknown): number | undefined {
  return adAccountDisableReasonSchema.parse(account).disable_reason;
}

/** `payload?.error?.message` for untrusted provider/HTTP JSON bodies. */
const providerErrorSchema = z
  .object({
    error: z.object({ message: optionalText }).catch({}),
  })
  .catch({ error: {} });

/** Read a provider error message, returning undefined for malformed bodies. */
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

/** Validate campaign fields and use empty objects for malformed provider data. */
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
        entryPoints: z
          .array(z.object({ uri: optionalText, entryPointType: optionalText }))
          .optional(),
      })
      .optional()
      .catch(undefined),
  })
  .catch({ start: {}, end: {} });

export type GoogleCalendarEventItem = z.infer<typeof googleCalendarEventSchema>;

const googleCalendarEventsSchema = z.object({
  items: z.array(googleCalendarEventSchema).nullish(),
});

/** Omitted items remain an empty calendar; malformed arrays must not hide existing events. */
export function readGoogleCalendarEvents(
  payload: unknown,
): Array<GoogleCalendarEventItem> {
  const parsed = googleCalendarEventsSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidToolInput("Google Calendar response", parsed.error);
  }
  return parsed.data.items ?? [];
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
  flags: Array<string>;
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

/** Keep only delegation entries with valid titles and prompts. */
export function parallelTaskArgs(
  items: Array<unknown>,
): Array<ParallelTaskArg> {
  return items.flatMap((item, index) => {
    const parsed = parallelTaskArgSchema.safeParse(item);
    if (!parsed.success) {
      console.warn(
        `[tools] Rejected delegate_parallel task ${index}`,
        parsed.error.issues.map((issue) => issue.path),
      );
      return [];
    }
    return [parsed.data];
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
  const parsed = automationStepArgSchema.safeParse(value);
  if (!parsed.success) {
    throw invalidToolInput("automation step", parsed.error);
  }
  return parsed.data;
}

/** A Meta ad account identifier from stored integration settings. */
export function readAdAccountId(value: unknown): string | number | undefined {
  const parsed = z.union([z.string(), z.number()]).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
