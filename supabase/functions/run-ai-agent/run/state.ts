import type * as types from "./contracts.ts";
/** Mutable run bindings shared by named stages; stages initialize them in execution order. */
export class RunState {
  declare command_text: string;
  declare temperature: types.RunBody["temperature"];
  declare automation_id: types.RunBody["automation_id"];
  declare user_name: types.RunBody["user_name"];
  declare lead_data: types.RunBody["lead_data"];
  declare tenant_id: types.RunBody["tenant_id"];
  declare user_id: types.RunBody["user_id"];
  declare task_mode: types.RunBody["task_mode"];
  declare conversation_history: types.RunBody["conversation_history"];
  declare conversation_id: types.RunBody["conversation_id"];
  declare wa_notify: types.RunBody["wa_notify"];
  declare inWorkshopRequest: boolean;
  declare task_skills: types.RunBody["task_skills"];
  declare modelOverride: string | null;
  declare pinSkillsOnly: boolean;
  declare automationRun: boolean;
  declare mayDecideApprovals: boolean;
  declare supabase: types.RunDatabaseClient;
  declare turnId: `${string}-${string}-${string}-${string}-${string}`;
  declare workshopNote: string | null;
  declare workshopRoleForRun: types.WorkshopRole | null;
  declare workshopMode: types.WorkshopMode | undefined;
  declare agent: types.RunAgent;
  declare agent_id: string | undefined;
  declare isCarmenAgent: boolean;
  declare tokenOptimize: boolean;
  declare resolvedTenantId: string;
  declare resolvedUserId: string;
  declare callerCampaignerId: string | null;
  declare callerName: string | null;
  declare callerPhone: string | null;
  declare callerRole: string | null;
  declare callerUserId: string | null;
  declare callerManagedAgencyIds: Array<string>;
  declare isManagerRoleCaller: boolean;
  declare isTeamManagerCaller: boolean;
  declare humanRequesterUserId: string | null;
  declare findingDraftReply: types.FindingDraftReply;
  declare devEscalationTier: types.EscalationTier;
  declare canEscalateDevFixes: boolean;
  declare serverConversationId: string | null;
  declare turnStartedAt: string;
  declare appChatTurn: boolean;
  declare serverConversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  declare instructionCaptured: string | null;
  declare agenciesRes: types.QueryResult<Array<types.AgencyRow>>;
  declare statsRes: [
    types.LeadCountResult,
    types.CountResult,
    types.CountResult,
  ];
  declare memoryRes: types.QueryResult<Array<types.MemoryRow>>;
  declare teamRosterRes: types.QueryResult<Array<types.RosterRow>>;
  declare tenantName: string;
  declare sharedAgencies: Array<types.SharedAgency>;
  declare memoryTenantIds: Array<string>;
  declare relevantLongTermMemory: Array<{
    label: string;
    text: string;
  }>;
  declare ownAgencyList: string;
  declare sharedAgencyList: string;
  declare leadsData: types.LeadCountResult;
  declare clientsData: types.CountResult;
  declare tasksData: types.CountResult;
  declare leadsByStatus: Record<string, number>;
  declare tenantContext: string;
  declare isCarmen: boolean;
  declare systemPrompt: string;
  declare filteredTools: Array<types.ToolDef>;
  declare toolPoolBeforeRouting: Array<types.ToolDef>;
  declare skinDisabledTools: ReadonlyArray<string>;
  declare inWorkshop: boolean;
  declare workshopToolAllowed: (name: string) => boolean;
  declare cmd: string;
  declare isStoredPulseRequest: boolean;
  declare pulseRefreshRoute: types.PulseRefreshRoute;
  declare userAskedBackground: boolean;
  declare userAskedManus: boolean;
  declare userAskedGithubAgent: boolean;
  declare promotedToolNames: Set<string>;
  declare exposedMcpTools: Array<types.ToolDef>;
  declare toolsForAPI: types.ToolApiEntries;
  declare rebuildToolsForApi: () => void;
  declare expandAgentTools: (extra: Array<types.ToolDef>) => void;
  declare mcpExecutors: Map<string, types.McpExecutor>;
  declare model: string;
  declare maxRounds: number;
  declare safeTemp: number | undefined;
  declare skillTenantId: string | null;
  declare disabledSkins: Array<string>;
  declare matchedSkills: Array<string>;
  declare devTaskOfferAnswered: boolean;
  declare approvalConversation: types.ConversationInput;
  declare userSaidApprove: boolean;
  declare approvalPick: types.ApprovalPick | null;
  declare pendingForConfirm: types.PickRow | null;
  declare messages: Array<types.RunMessage>;
  declare finalOutput: string;
  declare toolLog: Array<types.ToolLogEntry>;
  declare startTime: number;
  declare llm: types.LLMTarget;
  declare usageTokensIn: number;
  declare usageTokensOut: number;
  constructor(
    public input: types.RunInputs,
    public dependencies: types.RunDependencies,
  ) {}
}
