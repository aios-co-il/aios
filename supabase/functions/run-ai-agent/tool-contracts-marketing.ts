import type { AgentRow } from "./database-contracts.ts";
import { isObject } from "./json-config.ts";

type ClientName = Pick<AgentRow<"clients">, "name">;

export type MarketingWorkItemListRow = Pick<
  AgentRow<"marketing_work_items">,
  | "id"
  | "title"
  | "status"
  | "target_channel"
  | "client_id"
  | "pipeline_id"
  | "current_stage_id"
  | "payload"
  | "updated_at"
> & { clients: ClientName | null };

export type MarketingStageSummary = Pick<
  AgentRow<"marketing_pipeline_stages">,
  "id" | "name" | "stage_type" | "sort_order"
>;

export type OnboardingListRow = Pick<
  AgentRow<"client_onboarding">,
  "id" | "title" | "status"
> & { clients: ClientName | null };

export type AutomationFlowStepRow = Pick<
  AgentRow<"automation_flow_steps">,
  | "id"
  | "step_type"
  | "action_type"
  | "label"
  | "configuration"
  | "sort_order"
  | "parent_step_id"
  | "condition_branch"
  | "position_x"
  | "position_y"
>;

export type ChatHistorySearchRow = Pick<
  AgentRow<"chat_messages">,
  | "message_text"
  | "direction"
  | "sender_name"
  | "sender_phone"
  | "created_at"
  | "group_id"
  | "provider"
> & { clients: ClientName | null };

export type InboundMessageRow = Pick<
  AgentRow<"chat_messages">,
  | "id"
  | "message_text"
  | "sender_name"
  | "sender_phone"
  | "created_at"
  | "client_id"
  | "lead_id"
> & {
  clients: ClientName | null;
  leads: Pick<AgentRow<"leads">, "company_name"> | null;
};

export type FinanceListRow = Pick<
  AgentRow<"finance">,
  "id" | "amount" | "type" | "date" | "client_id"
> & { clients: ClientName | null };

export type AccountingClientRow = Pick<
  AgentRow<"clients">,
  | "id"
  | "name"
  | "status"
  | "agency_id"
  | "retainer"
  | "monthly_budget"
  | "monthly_fixed_expense"
> & { agencies: Pick<AgentRow<"agencies">, "name"> | null };

export type FinancialOverlayRow = Pick<
  AgentRow<"client_tenant_financial_data">,
  "client_id" | "retainer" | "monthly_budget"
>;

export type OneTimeIncomeRow = Pick<
  AgentRow<"one_time_incomes">,
  "id" | "client_id" | "product_name" | "amount" | "payment_month" | "notes"
> & { clients: ClientName | null };

export type PrioritizedTaskRow = Pick<
  AgentRow<"tasks">,
  | "id"
  | "title"
  | "status"
  | "priority"
  | "due_date"
  | "due_time"
  | "assigned_agent"
  | "goal_id"
> & {
  clients: ClientName | null;
  leads: Pick<AgentRow<"leads">, "company_name"> | null;
  campaigners: Pick<AgentRow<"campaigners">, "full_name"> | null;
};

/** Graph `me/adaccounts` entry; fields are passed through unvalidated as before. */
export type GraphAdAccount = {
  id?: unknown;
  name?: unknown;
  account_status?: unknown;
  currency?: unknown;
};

export type MetaLeadQuestion = { type: string; label?: string };

/** LLM-supplied lead form question; only `type` and `label` are read. */
export type MetaLeadQuestionInput = { type?: unknown; label?: unknown };

export function readMetaLeadQuestionInput(
  value: unknown,
): MetaLeadQuestionInput {
  if (!isObject(value)) return {};
  return {
    type: "type" in value ? value.type : undefined,
    label: "label" in value ? value.label : undefined,
  };
}
