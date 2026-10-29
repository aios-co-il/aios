import { z } from "zod";
import {
  Constants,
  type Enums,
  type Json,
  type Tables,
} from "@/integrations/supabase/types";
import { isJsonObject, type JsonColumnObject } from "@/lib/jsonFields";

export type MarketingApprovalMode = Enums<"marketing_approval_mode">;
export type MarketingStageType = Enums<"marketing_stage_type">;

const approvalModeSchema = z.enum(
  Constants.public.Enums.marketing_approval_mode,
);

export function isApprovalMode(value: unknown): value is MarketingApprovalMode {
  return approvalModeSchema.safeParse(value).success;
}

const jsonColumnObject = z.custom<JsonColumnObject>(isJsonObject);

const stageConfigurationSchema = z
  .object({
    instructions: z.string().catch(""),
    tools: z
      .array(z.unknown())
      .catch([])
      .transform((tools) =>
        tools.filter((tool): tool is string => typeof tool === "string"),
      ),
    target: jsonColumnObject.catch({}),
  })
  .catch({ instructions: "", tools: [], target: {} });

/** Stage configuration JSON: instructions, tool ids and the raw target object. */
export function parseStageConfiguration(value: Json): {
  instructions: string;
  tools: string[];
  target: JsonColumnObject;
} {
  return stageConfigurationSchema.parse(value);
}

/** A pipeline stage as MarketingPipelineBoard selects it. */
export type BoardStage = Pick<
  Tables<"marketing_pipeline_stages">,
  | "id"
  | "name"
  | "stage_type"
  | "sort_order"
  | "approval_mode"
  | "agent_id"
  | "configuration"
  | "pipeline_id"
> & { ai_agents: { id: string; name: string } | null };

/** A work item as MarketingPipelineBoard selects it. */
export type BoardWorkItem = Pick<
  Tables<"marketing_work_items">,
  "id" | "title" | "status" | "current_stage_id" | "scheduled_date" | "payload"
>;

export type SeoTableSettings = JsonColumnObject & {
  campaign_type?: string | null;
  default_report_mode?: string | null;
};

const stringOrNull = (value: Json | undefined) =>
  typeof value === "string" || value === null ? value : undefined;

/** GA/GSC table settings with the report-mode fields narrowed to strings. */
export function withSeoTableSettings<
  T extends { integration_settings: Json | null },
>(
  table: T,
): Omit<T, "integration_settings"> & {
  integration_settings: SeoTableSettings | null;
} {
  const raw = table.integration_settings;
  if (!isJsonObject(raw)) return { ...table, integration_settings: null };
  const { campaign_type, default_report_mode, ...rest } = raw;
  const settings: SeoTableSettings = { ...rest };
  const campaignType = stringOrNull(campaign_type);
  if (campaignType !== undefined) settings.campaign_type = campaignType;
  const reportMode = stringOrNull(default_report_mode);
  if (reportMode !== undefined) settings.default_report_mode = reportMode;
  return { ...table, integration_settings: settings };
}
