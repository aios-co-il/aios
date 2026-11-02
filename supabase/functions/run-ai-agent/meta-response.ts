import { z } from "npm:zod@3.25.76";
import { isObject } from "./json-config.ts";

export interface MetaAction {
  action_type?: string | null;
  value?: string | number | null;
}

interface MetaQuestion {
  key?: string | null;
  label?: string | null;
  type?: string | null;
}

type MetaNodeFields = {
  id?: string;
  name?: string;
  account_id?: string;
  account_status?: number;
  status?: string;
  effective_status?: string;
  objective?: string;
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  access_token?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  ctr?: string | number;
  cpc?: string | number;
  cpm?: string | number;
  frequency?: string | number;
  reach?: string | number;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  questions?: MetaQuestion[];
};

export type MetaNode = {
  [Key in keyof MetaNodeFields]: MetaNodeFields[Key] | null;
};

interface MetaResponse extends MetaNode {
  data?: MetaNode[] | null;
  error?: {
    message?: string | null;
    code?: number | null;
    type?: string | null;
  } | null;
  paging?: { next?: string | null } | null;
}

const text = z.string().nullish();
const metric = z.union([z.string(), z.number()]).nullish();
const actions = z
  .array(
    z
      .object({
        action_type: text,
        value: metric,
      })
      .passthrough(),
  )
  .nullish();

// Extra provider fields pass through so metric spreads keep working.
const metaNodeSchema: z.ZodType<MetaNode> = z
  .object({
    id: text,
    name: text,
    account_id: text,
    account_status: z.number().nullish(),
    status: text,
    effective_status: text,
    objective: text,
    campaign_id: text,
    campaign_name: text,
    ad_id: text,
    ad_name: text,
    daily_budget: text,
    lifetime_budget: text,
    access_token: text,
    spend: metric,
    impressions: metric,
    clicks: metric,
    ctr: metric,
    cpc: metric,
    cpm: metric,
    frequency: metric,
    reach: metric,
    actions,
    cost_per_action_type: actions,
    questions: z
      .array(
        z
          .object({
            key: text,
            label: text,
            type: text,
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();

const metaResponseSchema: z.ZodType<MetaResponse> = z
  .object({
    data: z.array(metaNodeSchema).nullish(),
    error: z
      .object({
        message: text,
        code: z.number().nullish(),
        type: text,
      })
      .passthrough()
      .nullish(),
    paging: z.object({ next: text }).passthrough().nullish(),
  })
  .passthrough()
  .and(metaNodeSchema) as z.ZodType<MetaResponse>;

export function isMetaNode(value: unknown): value is MetaNode {
  return metaNodeSchema.safeParse(value).success;
}

export type MetaResult =
  | { ok: true; value: MetaResponse }
  | { ok: false; error: Record<string, unknown> };

/**
 * Validate the Graph envelope once; keep extra provider fields for metric spreads.
 * An invalid body returns `{ ok: false, error }` with Meta's own `error` object when
 * it sent one, so callers choose whether to degrade or surface it.
 */
export async function readMetaResponse(
  response: Response,
): Promise<MetaResult> {
  const body: unknown = await response.json();
  const parsed = metaResponseSchema.safeParse(body);
  if (parsed.success) return { ok: true, value: parsed.data };
  const metaError: unknown = isObject(body)
    ? Reflect.get(body, "error")
    : undefined;
  return {
    ok: false,
    error: isObject(metaError)
      ? { ...metaError }
      : { message: "Invalid Meta response" },
  };
}
