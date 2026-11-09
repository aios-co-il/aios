import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { AgentRow } from "../database-contracts.ts";
import type { RunDependencies } from "../index.ts";
import type { Surface } from "../surface.ts";
import type {
  BrainEngine,
  BrainEngineTarget,
} from "../../_shared/carmen/brain-engine/load.ts";
import type { buildCarmenV2SystemPrompt } from "../../_shared/carmen-prompt-v2.ts";
import type { ToolExecutionContext, ToolScope } from "../tool-context.ts";
import type { messagesForProvider } from "../stream-completion.ts";
import type {
  ToolDef,
  buildToolApiEntries,
} from "../../_shared/carmen-token-optimizer.ts";
export type { ToolDef, RunDependencies };
export type { WorkshopRole } from "../../_shared/workshop/roles.ts";
export type { WorkshopMode } from "../../_shared/workshop/workshop-mode.ts";
export type { FindingDraftReply } from "../finding-draft/reply.ts";
export type { PulseRefreshRoute } from "../pulse-refresh/routing.ts";
export type { ApprovalPick, PickRow } from "../approvals/types.ts";
export type { ConversationInput } from "../approvals/binding.ts";
export type { LLMTarget } from "../llm/contracts.ts";
/** Request fields already accepted by the legacy run boundary; no new coercion. */
export interface RunBody extends Record<string, unknown> {
  agent_id?: string;
  command_text: string;
  temperature?: number;
  automation_id?: string;
  user_name?: string;
  lead_data?: Record<string, unknown>;
  tenant_id?: string;
  user_id?: string;
  task_skills?: Array<string>;
  task_mode?: string;
  conversation_history?: Array<{
    role: string;
    content: string;
  }>;
  conversation_id?: string;
  wa_notify?: ToolExecutionContext["waNotify"];
  carmen_automation?: {
    carmen_instructions?: unknown;
  };
  context_metadata?: {
    source?: string;
    [key: string]: unknown;
  };
}
export interface RunInputs {
  bodyJson: RunBody;
  surface: Surface;
  emit?: (obj: unknown) => void;
  brainEngine?: Extract<
    BrainEngine,
    {
      kind: "connections";
    }
  >;
  request: {
    authKind?: string;
    origin?: string | null;
  };
  internalTail?: () => Promise<Array<BrainEngineTarget>>;
}
export type RunAgent = Parameters<
  typeof buildCarmenV2SystemPrompt
>[0]["agent"] &
  Pick<AgentRow<"ai_agents">, "id" | "tenant_id" | "mood"> & {
    disabled_tools?: Array<string>;
    disabled_skins?: Array<string>;
    disabled_integrations?: Array<string>;
  };
export type RunDatabaseClient = AgentDatabaseClient;
export type EscalationTier = ToolScope["devEscalationTier"];
export type RunMessage = Parameters<typeof messagesForProvider>[0][number] & {
  role?: string;
};
export type ToolApiEntries = ReturnType<typeof buildToolApiEntries>;
export type ExecutedToolResult = Awaited<
  ReturnType<RunDependencies["executeTool"]>
>;
export type McpExecutor = (
  args: Record<string, unknown>,
) => Promise<ExecutedToolResult>;
export type ToolLogEntry = {
  tool: string;
  args: Record<string, unknown>;
  result: ExecutedToolResult;
};
export type QueryResult<Row> = {
  data: Row | null;
  count?: number | null;
  error?: unknown;
};
export type AgencyRow = {
  id: string;
  name: string;
  tenant_id: string | null;
};
export type LeadCountResult = QueryResult<Array<{ status: string }>>;
export type CountResult = QueryResult<Array<{ id: string }>>;
export type MemoryRow = {
  key: string;
  content: string;
  category: string;
};
export type RosterRow = {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  role?: Array<string> | null;
};
export type SharedAgency = {
  id: string;
  name: string;
  source_tenant_id: string;
  source_tenant_name: string;
};
export type ProceduralSkill = Pick<
  AgentRow<"ai_skills">,
  "id" | "name" | "description" | "steps" | "version" | "usage_count"
>;

export type SharedAgencyAccessRow = {
  agency_id: string;
  source_tenant_id: string;
  agencies: { name: string } | null;
  tenants: { name: string } | null;
};
export type RecalledMemoryItem = {
  title: string;
  summary: string;
  category: string;
  importance?: number;
};
