export type DelegateToManusArgs = { prompt: string; context_data?: string };

export type SendMessageToManusArgs = { message: string; task_id?: string };

export type DelegateToGithubAgentArgs = {
  message: string;
  action?: "chat_support" | "analyze_error" | "fix_code" | "check_permissions";
};

export type DelegateToSubagentArgs = {
  title: string;
  prompt: string;
  task_mode?:
    | "analyst"
    | "sales"
    | "support"
    | "copywriting"
    | "scheduler"
    | "onboarding";
  task_skills?: Array<string>;
  priority?: number;
};

export type GetSubagentResultArgs = { sub_task_id: string };

export type DelegateParallelArgs = {
  tasks: Array<{
    title: string;
    prompt: string;
    task_skills?: Array<string>;
    side_effects?: boolean;
  }>;
};

export type GetBatchResultsArgs = { batch_id: string };
