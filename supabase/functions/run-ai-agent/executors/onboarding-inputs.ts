import type { AgentRow } from "../database-contracts.ts";
export type CreateOnboardingArgs = {
  title: string;
  client_id: string;
  campaigner_id?: string;
  notes?: string;
};

export type ListOnboardingArgs = {
  status?: AgentRow<"client_onboarding">["status"];
  limit?: number;
};

export type UpdateOnboardingStatusArgs = {
  onboarding_id: string;
  status: AgentRow<"client_onboarding">["status"];
};
