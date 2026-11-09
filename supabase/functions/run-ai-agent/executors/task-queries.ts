import type { AgentRow } from "../database-contracts.ts";
export type ListMyAgentTasksArgs = {
  status?: "pending" | "running" | "completed" | "failed";
  limit?: number;
};

export type SearchTasksArgs = {
  search_term: string;
  status?: AgentRow<"tasks">["status"];
  client_id?: string;
};

export type ListTasksArgs = {
  status?: AgentRow<"tasks">["status"];
  client_id?: string;
  limit?: number;
};
