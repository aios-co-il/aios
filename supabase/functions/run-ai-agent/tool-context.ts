import type { AgentDatabaseClient } from "./database-contracts.ts";
import type { Json } from "../_shared/database.types.ts";
import type { FindingDraftReply } from "./finding-draft/reply.ts";

export interface ToolCaller {
  tenantId: string;
  userId: string | null;
  callerCampaignerId?: string | null;
  agentId?: string | null;
  callerRole?: string | null;
  callerManagedAgencyIds?: Array<string> | null;
  callerPhone?: string | null;
}

export interface ToolApproval {
  turnId?: string | null;
  userText?: string | null;
  /** Carmen's previous message; the workshop reads the taps that answer it. */
  lastAssistant?: string | null;
  /** The board page marked with this message (workshop_artifact_id). */
  markedArtifactId?: string | null;
  outOfBand?: boolean;
  /** The client open in the workshop view (workshop_client_id). */
  viewClientId?: string | null;
  /** The project open on the workshop board (workshop_item_id). */
  openItemId?: string | null;
  /** approve_dev_task and dispatch_dev_task wait for the user's yes in a later message. */
  devTaskTurn?: {
    /** When the user's message of this turn arrived; the offered task must be older. */
    turnStartedAt: string;
    /** A signed-in user typed this turn in an AIOS chat (not a service call). */
    appChatUser: boolean;
    /** Carmen's previous message; the user's yes answers its dev-task question only. */
    lastAssistantText: string;
  } | null;
}

export interface ToolScope {
  actorUserId: string | null;
  devEscalationTier: "full" | "bugfix" | null;
  accessibleTenantIds: Array<string>;
  isManagerRole: boolean;
  isTeamManager: boolean;
  managedAgencyIds: Array<string>;
  bypassCampaignerScope: boolean;
  canManageAutomations: boolean;
  callerScope: {
    callerCampaignerId?: string | null;
    isManagerRole: boolean;
    isTeamManager: boolean;
    managedAgencyIds: Array<string>;
    accessibleTenantIds: Array<string>;
  };
}

export interface ToolDispatchDependencies {
  loadTier(caller: {
    tenantId: string;
    agentId: string | null;
    userId: string | null;
    campaignerId: string | null;
    phone: string | null;
  }): Promise<ToolScope["devEscalationTier"]>;
  accessibleTenants(tenantId: string): Promise<Array<string>>;
}

export interface ToolExecutionContext extends ToolCaller, ToolScope {
  supabase: AgentDatabaseClient;
  name: string;
  waNotify?: Record<string, Json | undefined> | null;
  surface?: string | null;
  conversationId?: string | null;
  approval: ToolApproval;
  appLinkOrigin?: string | null;
  humanRequesterUserId?: string | null;
  findingDraftReply?: FindingDraftReply | null;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
