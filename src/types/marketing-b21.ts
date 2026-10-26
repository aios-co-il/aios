import {
  Constants,
  type Enums,
  type Json,
  type Tables,
} from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The string at `key` of a JSON object column, or undefined. */
export function jsonString(value: unknown, key: string): string | undefined {
  if (!isJsonObject(value)) return undefined;
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

/** The string entries of a JSON array, or [] when it is not an array. */
export function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

export type MarketingApprovalMode = Enums<"marketing_approval_mode">;
export type MarketingStageType = Enums<"marketing_stage_type">;

export function isApprovalMode(value: unknown): value is MarketingApprovalMode {
  return Constants.public.Enums.marketing_approval_mode.some(
    (mode) => mode === value,
  );
}

/** Stage configuration JSON: instructions, tool ids and the raw target object. */
export function parseStageConfiguration(value: unknown): {
  instructions: string;
  tools: string[];
  target: JsonObject;
} {
  const cfg = isJsonObject(value) ? value : {};
  return {
    instructions: jsonString(cfg, "instructions") ?? "",
    tools: jsonStringArray(cfg.tools),
    target: isJsonObject(cfg.target) ? cfg.target : {},
  };
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

export type SeoTableSettings = JsonObject & {
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
