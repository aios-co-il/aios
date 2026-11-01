import { z } from "npm:zod@3.25.76";
import type { AgentRow } from "./database-contracts.ts";

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

const graphAdAccountSchema = z
  .object({
    id: z.unknown(),
    name: z.unknown(),
    account_status: z.unknown(),
    currency: z.unknown(),
  })
  .catch({});

export type GraphAdAccount = z.infer<typeof graphAdAccountSchema>;

/** Graph `me/adaccounts` page; account fields are passed through unvalidated. */
const graphAdAccountsPageSchema = z
  .object({
    data: z.array(graphAdAccountSchema).nullish().catch(null),
    error: z
      .object({ message: z.unknown() })
      .nullish()
      .catch({ message: undefined }),
    paging: z
      .object({ next: z.string().nullish().catch(null) })
      .nullish()
      .catch(null),
  })
  .catch({});

export function readGraphAdAccountsPage(value: unknown) {
  return graphAdAccountsPageSchema.parse(value);
}

export type MetaLeadQuestion = { type: string; label?: string };

/** LLM-supplied lead form question; only `type` and `label` are read. */
const metaLeadQuestionInputSchema = z
  .object({ type: z.unknown(), label: z.unknown() })
  .catch({});

export type MetaLeadQuestionInput = z.infer<typeof metaLeadQuestionInputSchema>;

export function readMetaLeadQuestionInput(
  value: unknown,
): MetaLeadQuestionInput {
  return metaLeadQuestionInputSchema.parse(value);
}
