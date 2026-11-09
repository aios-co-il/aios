import { runOrchestratedAgent } from "./run/orchestrate.ts";
import { CORE_TOOLS } from "./run/core-tools.ts";

import { resolveLLMTarget } from "./llm/target.ts";

import { FAST_LANE_MODELS } from "./llm/models.ts";

import { estimateLLMCostUSD } from "./llm/cost.ts";
import { executeGetOpenaiBillingStatus } from "./executors/get-openai-billing-status.ts";
import { executeQuerySystemGraph } from "./executors/query-system-graph.ts";
import { executeSetCampaignTableActive } from "./executors/set-campaign-table-active.ts";
import { executeSearchEntities } from "./executors/search-entities.ts";
import { executeDelegateToManus } from "./executors/delegate-to-manus.ts";
import { executeSendMessageToManus } from "./executors/send-message-to-manus.ts";
import { executeListAutomations } from "./executors/list-automations.ts";
import { executeGetAutomationDetails } from "./executors/get-automation-details.ts";
import { executeProposeAutomationEdit } from "./executors/propose-automation-edit.ts";
import { executeInspectMetaLeadForms } from "./executors/inspect-meta-lead-forms.ts";
import { executeSetAutomationMetaLeadForm } from "./executors/set-automation-meta-lead-form.ts";
import { executeCreateMetaLeadForm } from "./executors/create-meta-lead-form.ts";
import { executeListIntegrations } from "./executors/list-integrations.ts";
import { executeToggleIntegration } from "./executors/toggle-integration.ts";
import { executeListAgents } from "./executors/list-agents.ts";
import { executeCreateAgent } from "./executors/create-agent.ts";
import { executeUpdateAgent } from "./executors/update-agent.ts";
import { executeDelegateToGithubAgent } from "./executors/delegate-to-github-agent.ts";
import { executeCreateWhatsappInstance } from "./executors/create-whatsapp-instance.ts";
import { executeGetWhatsappQrLink } from "./executors/get-whatsapp-qr-link.ts";
import { executeGetWhatsappStatus } from "./executors/get-whatsapp-status.ts";
import { executeSendWhatsappViaGateway } from "./executors/send-whatsapp-via-gateway.ts";
import { executeGetCarmenSkins } from "./executors/get-carmen-skins.ts";
import { executeRecallSkills } from "./executors/recall-skills.ts";
import { executeCreateSkill } from "./executors/create-skill.ts";
import { executeUpdateSkill } from "./executors/update-skill.ts";
import { executeDelegateToSubagent } from "./executors/delegate-to-subagent.ts";
import { executeGetSubagentResult } from "./executors/get-subagent-result.ts";
import { executeDelegateParallel } from "./executors/delegate-parallel.ts";
import { executeGetBatchResults } from "./executors/get-batch-results.ts";
import { executeProposeAutomation } from "./executors/propose-automation.ts";
import { executeListPendingApprovals } from "./executors/list-pending-approvals.ts";
import { executeExecutePendingApproval } from "./executors/execute-pending-approval.ts";
import { executeRejectPendingApproval } from "./executors/reject-pending-approval.ts";
import { executeRecallRecentAction } from "./executors/recall-recent-action.ts";
import { executeRecordActionEpisode } from "./executors/record-action-episode.ts";
import { executeSendMessage } from "./executors/send-message.ts";
import { executeSaveMemory } from "./executors/save-memory.ts";
import { executeRecallMemory } from "./executors/recall-memory.ts";
import { executeRecallMemoryFts } from "./executors/recall-memory-fts.ts";
import { executeDeleteMemory } from "./executors/delete-memory.ts";
import { executeKbListFolder } from "./executors/kb-list-folder.ts";
import { executeKbSearch } from "./executors/kb-search.ts";
import { executeKbOpen } from "./executors/kb-open.ts";
import { executeKbRecallConversation } from "./executors/kb-recall-conversation.ts";
import { executeKbLearn } from "./executors/kb-learn.ts";
import { executeSearchConversationHistory } from "./executors/search-conversation-history.ts";
import { executeListBroadcasts } from "./executors/list-broadcasts.ts";
import { executeCreateBroadcast } from "./executors/create-broadcast.ts";
import { executeSendBroadcastNow } from "./executors/send-broadcast-now.ts";
import { executeScheduleBroadcast } from "./executors/schedule-broadcast.ts";
import { executeCancelBroadcast } from "./executors/cancel-broadcast.ts";
import { executeListWaGroups } from "./executors/list-wa-groups.ts";
import { executeSendCalendarInvite } from "./executors/send-calendar-invite.ts";
import { executeListCalendarEvents } from "./executors/list-calendar-events.ts";
import { executeUpdateCalendarInvite } from "./executors/update-calendar-invite.ts";
import { executeCancelCalendarInvite } from "./executors/cancel-calendar-invite.ts";
import { executeJoinMeetingForClient } from "./executors/join-meeting-for-client.ts";
import { executeGetMeetingBotStatus } from "./executors/get-meeting-bot-status.ts";
import { executeLookupStaffWhatsapp } from "./executors/lookup-staff-whatsapp.ts";
import { executeSendMessageToCampaigner } from "./executors/send-message-to-campaigner.ts";
import { executeGetMaskyooCallsReport } from "./executors/get-maskyoo-calls-report.ts";
import { executeSyncMaskyooCdr } from "./executors/sync-maskyoo-cdr.ts";
import { executeListSocialPages } from "./executors/list-social-pages.ts";
import { executeSyncSocialPages } from "./executors/sync-social-pages.ts";
import { executePublishSocialPost } from "./executors/publish-social-post.ts";
import { executeFetchSocialComments } from "./executors/fetch-social-comments.ts";
import { executeListSocialComments } from "./executors/list-social-comments.ts";
import { executeHideSocialComment } from "./executors/hide-social-comment.ts";
import { executeCreateSocialPost } from "./executors/create-social-post.ts";
import { executeListMarketingWorkItems } from "./executors/list-marketing-work-items.ts";
import { executeGetMarketingWorkItem } from "./executors/get-marketing-work-item.ts";
import { executeCreateMarketingWorkItem } from "./executors/create-marketing-work-item.ts";
import { executeHandoffMarketingWorkItem } from "./executors/handoff-marketing-work-item.ts";
import { executeUpdateMarketingWorkItem } from "./executors/update-marketing-work-item.ts";
import { executeGenerateAdImage } from "./executors/generate-ad-image.ts";
import { executeListCampaigners } from "./executors/list-campaigners.ts";
import { executeCreateCampaigner } from "./executors/create-campaigner.ts";
import { executeListSalesPeople } from "./executors/list-sales-people.ts";
import { executeCreateSalesPerson } from "./executors/create-sales-person.ts";
import { executeListAgencies } from "./executors/list-agencies.ts";
import { executeCreateAgency } from "./executors/create-agency.ts";
import { executeListSuppliers } from "./executors/list-suppliers.ts";
import { executeCreateSupplier } from "./executors/create-supplier.ts";
import { executeListProducts } from "./executors/list-products.ts";
import { executeCreateProduct } from "./executors/create-product.ts";
import { executeListFinance } from "./executors/list-finance.ts";
import { executeCreateFinanceEntry } from "./executors/create-finance-entry.ts";
import { executeGetFinanceSummary } from "./executors/get-finance-summary.ts";
import { executeGetAccountingOverview } from "./executors/get-accounting-overview.ts";
import { executeGetClientRetainer } from "./executors/get-client-retainer.ts";
import { executeListOneTimeIncomes } from "./executors/list-one-time-incomes.ts";
import { executeListIncomePayments } from "./executors/list-income-payments.ts";
import { executeListExpensePayments } from "./executors/list-expense-payments.ts";
import { executeListInvoiceUploads } from "./executors/list-invoice-uploads.ts";
import { executeUpdateClientRetainer } from "./executors/update-client-retainer.ts";
import { executeListUpdates } from "./executors/list-updates.ts";
import { executeSaveMediaFromChat } from "./executors/save-media-from-chat.ts";
import { executeListClientMedia } from "./executors/list-client-media.ts";
import { executeGetFacebookCampaignData } from "./executors/get-facebook-campaign-data.ts";
import { executeListFacebookCampaigns } from "./executors/list-facebook-campaigns.ts";
import { executeFacebookCampaignMutation } from "./executors/facebook-campaign-mutation.ts";
import { executeAnalyzeFacebookCampaign } from "./executors/analyze-facebook-campaign.ts";
import { executeListFacebookAds } from "./executors/list-facebook-ads.ts";
import { executeInspectFacebookAd } from "./executors/inspect-facebook-ad.ts";
import { executeDuplicateFacebookAdVariants } from "./executors/duplicate-facebook-ad-variants.ts";
import { executeGetCampaignAlerts } from "./executors/get-campaign-alerts.ts";
import { executeAcknowledgeCampaignAlert } from "./executors/acknowledge-campaign-alert.ts";
import { executeResolveCampaignAlert } from "./executors/resolve-campaign-alert.ts";
import { executeGetLatestCampaignPulse } from "./executors/get-latest-campaign-pulse.ts";
import { executeRefreshCampaignPulseTool } from "./executors/refresh-campaign-pulse.ts";
import { executeAnalyzeCampaignPerformance } from "./executors/analyze-campaign-performance.ts";
import { executeUpdateClientHealth } from "./executors/update-client-health.ts";
import { executeGetClientRetentionScan } from "./executors/get-client-retention-scan.ts";
import { executeBatchUpdateClientHealth } from "./executors/batch-update-client-health.ts";
import { executeGetDashboardStats } from "./executors/get-dashboard-stats.ts";
import { executeListFacebookAdAccounts } from "./executors/list-facebook-ad-accounts.ts";
import { executeCreateFacebookReportTable } from "./executors/create-facebook-report-table.ts";
import { executeVerifyReportVsMeta } from "./executors/verify-report-vs-meta.ts";
import { executeGetReconciliationStatus } from "./executors/get-reconciliation-status.ts";
import { executeCheckAdAccountsHealth } from "./executors/check-ad-accounts-health.ts";
import { executeListUnconnectedClients } from "./executors/list-unconnected-clients.ts";
import { queueAdActionApproval } from "./executors/ad-action-approval.ts";
import { executeListGoogleAdAccounts } from "./executors/list-google-ad-accounts.ts";
import { executeListGoogleCampaigns } from "./executors/list-google-campaigns.ts";
import { executeCreateGoogleAdsReportTable } from "./executors/create-google-ads-report-table.ts";
import { executeSyncFacebookInsights } from "./executors/sync-facebook-insights.ts";
import { executeConnectGoogleAdsAccount } from "./executors/connect-google-ads-account.ts";
import { executeConnectClientMetaAdAccount } from "./executors/connect-client-meta-ad-account.ts";
import { executeScheduleCampaignToggle } from "./executors/schedule-campaign-toggle.ts";
import { executeListCampaignSchedules } from "./executors/list-campaign-schedules.ts";
import { executeCancelCampaignSchedule } from "./executors/cancel-campaign-schedule.ts";

import { executeCreateTask } from "./executors/create-task.ts";
import { executeCreateAgentTask } from "./executors/create-agent-task.ts";
import { executeListMyAgentTasks } from "./executors/list-my-agent-tasks.ts";
import { executeSearchTasks } from "./executors/search-tasks.ts";
import { executeListTasks } from "./executors/list-tasks.ts";
import { executeUpdateTaskStatus } from "./executors/update-task-status.ts";
import { executeUpdateTask } from "./executors/update-task.ts";
import { executeDeleteTask } from "./executors/delete-task.ts";
import { executeAddTaskUpdate } from "./executors/add-task-update.ts";
import { executeManageTaskCollaborators } from "./executors/manage-task-collaborators.ts";
import { executeCreateOnboarding } from "./executors/create-onboarding.ts";
import { executeListOnboarding } from "./executors/list-onboarding.ts";
import { executeUpdateOnboardingStatus } from "./executors/update-onboarding-status.ts";
import { executeCreateGoal } from "./executors/create-goal.ts";
import { executeListGoals } from "./executors/list-goals.ts";
import { executeFindExecutionGoalDuplicates } from "./executors/find-execution-goal-duplicates.ts";
import { executeCreateExecutionGoal } from "./executors/create-execution-goal.ts";
import { executeGetExecutionGoalReport } from "./executors/get-execution-goal-report.ts";
import { executeAddGoalMilestone } from "./executors/add-goal-milestone.ts";
import { executeAddGoalBlocker } from "./executors/add-goal-blocker.ts";
import { executeLinkTaskToExecutionGoal } from "./executors/link-task-to-execution-goal.ts";
import { executeGetAutonomousGoalStatus } from "./executors/get-autonomous-goal-status.ts";
import { executeTakeTask } from "./executors/take-task.ts";
import { executeAssignTaskToCursor } from "./executors/assign-task-to-cursor.ts";
import { executeFindDevTaskDuplicates } from "./executors/find-dev-task-duplicates.ts";
import { executeCreateDevTask } from "./executors/create-dev-task.ts";
import { executeApproveDevTask } from "./executors/approve-dev-task.ts";
import { executeDispatchDevTask } from "./executors/dispatch-dev-task.ts";
import { executeListDevTasks } from "./executors/list-dev-tasks.ts";
import { executeUpdateDevTask } from "./executors/update-dev-task.ts";
import { executeAttachDevTaskSession } from "./executors/attach-dev-task-session.ts";
import { executeCompleteTaskStep } from "./executors/complete-task-step.ts";
import { executePrioritizeTasks } from "./executors/prioritize-tasks.ts";
import { listClients } from "./executors/client-list.ts";
import { executeClientRecordTool } from "./executors/client-records.ts";

import { executeLeadTool } from "./executors/lead-tools.ts";
import { prepareToolDispatch } from "./tool-dispatch.ts";
import type { ToolApproval, ToolExecutionContext } from "./tool-context.ts";
import { ALL_TOOLS } from "./tool-catalog.ts";
// redeploy trigger (restore #5): a Grok-driven session replaced this file — in git AND in prod (v81) — with a
// literal "REPLACE_WITH_FIXED_VERSION" placeholder, so the deployed function had no code at all and every Carmen
// call failed. This restores the last known-good monolithic version (cb03f8b, includes Maskyoo tools from PR #102).
// HARD RULE for any session editing this file: never commit/deploy a placeholder or a "rewrite" that drops the
// ai_agents/command_text contract — the WhatsApp webhooks depend on it. Small, additive diffs only.
// broken rewrite querying a non-existent `agents` table → every agent call 404'd). This is the
// known-good monolithic version from main; CI redeploys it via the Supabase CLI. (re-deploy: a stray placeholder bundle had overwritten v40).
import type {} from "../_shared/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

import {
  brainDenied,
  internalBrainDenied,
} from "../_shared/carmen/brain-guard.ts";
import {
  type BrainEngine,
  type BrainEngineTarget,
} from "../_shared/carmen/brain-engine/load.ts";
import { resolveWorkshopAwareEngine } from "../_shared/carmen/brain-engine/workshop-brain.ts";
import { openRouterTail } from "../_shared/carmen/brain-engine/openrouter-tail.ts";

import { remoteAdImage } from "../_shared/creative/ad-image-remote.ts";

import {
  createReplyRecorder,
  parseReplyKey,
  saveCarmenReply,
} from "../_shared/carmen/background-reply.ts";

import { REFRESH_PULSE_TOOL_NAME } from "../_shared/carmen/pulse-tools.ts";

import { keepCarmenPulseTools } from "./pulse-refresh/tool-pool.ts";

import {
  classifyDirectTool,
  directToolPool,
} from "../_shared/carmen-direct-tools.mjs";

import { MANAGER_ROLES } from "./manager-roles.ts";
import { assertCallerCanAccessClient } from "../_shared/auth-helpers.ts";

import {
  getChatHistory,
  getRecentInboundMessages,
} from "./chat-scope/readers.ts";

import { asUuidOrNull } from "../_shared/uuid.ts";

import {
  executeVideoDirectorTool,
  isVideoDirectorTool,
} from "../_shared/video-director-tools.ts";
import {
  executeCardDraftTool,
  isCardDraftTool,
} from "./card-draft-approval/tool.ts";
import {
  executeCreativeStudioTool,
  isCreativeStudioTool,
} from "../_shared/creative-studio-tools.ts";
import {
  executeFindingDraftTool,
  isFindingDraftTool,
} from "./finding-draft/tool.ts";
import { type FindingDraftReply } from "./finding-draft/reply.ts";
import {
  executeWorkshopTool,
  isWorkshopTool,
} from "../_shared/workshop-tools.ts";

import { workshopVoiceSample } from "../_shared/workshop/voice-sample.ts";

import { callerAddressLine } from "../_shared/carmen/user-address.ts";

import { sceneEngineFor } from "../_shared/workshop/scene-engine-for.ts";
import { connectedSceneEngines } from "../_shared/workshop/engine-choice.ts";
import { videoConnectionsFor } from "../_shared/workshop/video-connections.ts";
import {
  connectedProviders,
  imageProvidersFor,
} from "../_shared/workshop/capabilities.ts";
import { fetchPublic } from "../_shared/public-fetch.ts";

import { importWebImage } from "../_shared/workshop/tools/add-assets.ts";

import { isPulseTargetTool } from "../_shared/carmen/pulse-targets/tool-defs.ts";
import { executePulseTargetTool } from "../_shared/carmen/pulse-targets/execute.ts";

import { loadDevEscalationTierFromDb } from "../_shared/carmen-access-policy.ts";

import type { ApprovalPick } from "./approvals/types.ts";

import type { AgentDatabaseClient } from "./database-contracts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Tool router (embedding-backed) ───
// Carmen has ~140 tools; sending all of them every request wastes tokens,
// dilutes tool selection, and collides with OpenAI's 128-tool cap. The router
// embeds the user's message and keeps only the most relevant tools plus an
// always-on core set, so each request carries a small, focused toolset. Fully
// best-effort: any failure falls back to the full set (capToolsForTarget stays
// as the final backstop for OpenAI's limit).
// Reflex tools Carmen must always be able to reach regardless of the message.

async function getAccessibleTenantIds(
  supabase: AgentDatabaseClient,
  tenantId: string,
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("agency_tenant_access")
      .select("source_tenant_id")
      .eq("accessing_tenant_id", tenantId);
    const extra = (data || []).map((r) => r.source_tenant_id).filter(Boolean);
    return Array.from(new Set([tenantId, ...extra]));
  } catch (_) {
    return [tenantId];
  }
}

async function executeTool(
  name: string,
  args: Record<string, any>,
  supabase: any,
  tenantId: string,
  userId: string | null,
  callerCampaignerId?: string | null,
  agentId?: string | null,
  callerRole?: string | null,
  callerManagedAgencyIds?: string[] | null,
  callerPhone?: string | null,
  waNotify?: any,
  surface?: string | null,
  conversationId?: string | null,
  approval: ToolApproval = {},
  /** The chat's app origin (request Origin), for full links to files the app serves. */
  appLinkOrigin?: string | null,
  // The person talking to Carmen in this run (resolveHumanRequesterUserId).
  // Omitted = nobody can vouch for a client contact, so calls are not logged.
  humanRequesterUserId?: string | null,
  // The "תעדי <code>" this run answers (confirm_finding_draft); omitted = none.
  findingDraftReply?: FindingDraftReply | null,
): Promise<any> {
  const prepared = await prepareToolDispatch(
    name,
    {
      tenantId,
      userId,
      callerCampaignerId,
      agentId,
      callerRole,
      callerManagedAgencyIds,
      callerPhone,
    },
    {
      loadTier: (caller) => loadDevEscalationTierFromDb(supabase, caller),
      accessibleTenants: (id) => getAccessibleTenantIds(supabase, id),
    },
  );
  if ("refusal" in prepared) {
    return prepared.refusal;
  }
  const {
    actorUserId,
    devEscalationTier,
    accessibleTenantIds,
    isManagerRole,
    isTeamManager,
    managedAgencyIds,
    bypassCampaignerScope,
    canManageAutomations,
    callerScope,
  } = prepared.scope;
  const toolContext: ToolExecutionContext = {
    ...prepared.scope,
    supabase,
    tenantId,
    userId,
    name,
    waNotify,
    callerCampaignerId,
    agentId,
    callerRole,
    callerManagedAgencyIds,
    callerPhone,
    surface,
    conversationId,
    approval,
    appLinkOrigin,
    humanRequesterUserId,
    findingDraftReply,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  };
  if (isWorkshopTool(name)) {
    return executeWorkshopTool(
      supabase,
      tenantId,
      name,
      args,
      (clientId) =>
        assertCallerCanAccessClient(supabase, clientId, callerScope),
      actorUserId,
      {
        turnId: approval.turnId ?? null,
        userText: approval.userText ?? null,
        lastAssistant: approval.lastAssistant ?? null,
        markedArtifactId: approval.markedArtifactId ?? null,
        approvedOutOfBand: approval.outOfBand === true,
        viewClientId: approval.viewClientId ?? null,
        openItemId: approval.openItemId ?? null,
        imageEngines: async () => {
          const { data } = await supabase
            .from("tenant_integrations")
            .select("settings")
            .eq("tenant_id", tenantId)
            .eq("integration_type", "llm")
            .eq("is_active", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return imageProvidersFor(
            connectedProviders(
              (data?.settings || {}) as Record<string, unknown>,
              { openai: Deno.env.get("OPENAI_API_KEY") ?? undefined },
            ),
          );
        },
        generateImage: async (prompt, format, references, engine) => {
          // Each picture in its own request: several made here ran past the CPU limit.
          const remote = await remoteAdImage(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            tenantId,
            {
              prompt,
              aspect_ratio: format,
              reference_urls: references,
              engine,
            },
          );
          if (!("missing" in remote && remote.missing)) return remote;
          const made = await executeTool(
            "generate_ad_image",
            {
              prompt,
              aspect_ratio: format,
              reference_urls: references,
              engine,
            },
            supabase,
            tenantId,
            userId,
            callerCampaignerId,
            agentId,
            callerRole,
            callerManagedAgencyIds,
            callerPhone,
            waNotify,
            surface,
            conversationId,
          );
          return made?.image_url
            ? { image_url: made.image_url as string }
            : { error: String(made?.error ?? "לא התקבלה תמונה") };
        },
        envOpenAiKey: Deno.env.get("OPENAI_API_KEY") ?? undefined,
        background: (work) => {
          try {
            EdgeRuntime.waitUntil(work);
          } catch {
            void work;
          }
        },
        fetchPublic: (url, options) => fetchPublic(url, options),
        voiceSample: (voiceId) =>
          workshopVoiceSample(supabase, tenantId, voiceId),
        importImage: (url, scope) =>
          importWebImage(supabase, fetchPublic, url, scope),
        defaultEngine: async () => {
          const { data } = await supabase
            .from("tenant_integrations")
            .select("settings")
            .eq("tenant_id", tenantId)
            .eq("integration_type", "llm")
            .eq("is_active", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return sceneEngineFor(
            (data?.settings || {}) as Record<string, unknown>,
            fetch,
            await videoConnectionsFor(supabase, tenantId),
          );
        },
        sceneEngines: async () => {
          const { data } = await supabase
            .from("tenant_integrations")
            .select("settings")
            .eq("tenant_id", tenantId)
            .eq("integration_type", "llm")
            .eq("is_active", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return connectedSceneEngines(
            (data?.settings || {}) as Record<string, unknown>,
            await videoConnectionsFor(supabase, tenantId),
            Deno.env.get("RENDER_WORKER_KLING") === "1",
          );
        },
        videoConnections: () => videoConnectionsFor(supabase, tenantId),
      },
    );
  }
  // Chat readers (AIO-231) scope from the verified caller and the WhatsApp chat
  // of this turn, never from tool args, and read the caller's role in this
  // tenant: callerRole here is the highest role across all their tenants.
  const chatRead = {
    supabase,
    scopeInput: {
      tenantId,
      accessibleTenantIds,
      userId: actorUserId,
      callerCampaignerId: callerCampaignerId ?? null,
      waNotify,
    },
  };
  if (isVideoDirectorTool(name)) {
    return executeVideoDirectorTool(
      supabase,
      tenantId,
      name,
      args,
      (clientId) =>
        assertCallerCanAccessClient(supabase, clientId, callerScope),
    );
  }
  if (isCardDraftTool(name)) {
    return executeCardDraftTool(supabase, {
      tenantId,
      args,
      requesterUserId: humanRequesterUserId ?? null,
      reply: findingDraftReply ?? null,
    });
  }
  if (isCreativeStudioTool(name)) {
    return executeCreativeStudioTool(
      supabase,
      tenantId,
      name,
      args,
      (clientId) =>
        assertCallerCanAccessClient(supabase, clientId, callerScope),
    );
  }
  if (isFindingDraftTool(name)) {
    return executeFindingDraftTool(supabase, {
      tenantId,
      args,
      requesterUserId: humanRequesterUserId ?? null,
      reply: findingDraftReply ?? null,
    });
  }
  if (isPulseTargetTool(name)) {
    return executePulseTargetTool(
      supabase,
      {
        tenantId,
        accessibleTenantIds,
        actorUserId,
        agentId: agentId || null,
        callerRole: callerRole || null,
        callerPhone: callerPhone || null,
        isManagerRole,
        isTeamManager,
        managedAgencyIds,
        callerCampaignerId: callerCampaignerId || null,
        assertClientAccess: (clientId) =>
          assertCallerCanAccessClient(supabase, clientId, callerScope),
      },
      name,
      args,
    );
  }
  // Preserve legacy argument acceptance; domain modules expose named input contracts.
  switch (name) {
    case "query_system_graph":
      return executeQuerySystemGraph(
        args as Parameters<typeof executeQuerySystemGraph>[0],
        toolContext,
      );
    case "create_lead":
    case "list_leads":
    case "update_lead_status":
    case "add_lead_update":
    case "update_lead":
    case "delete_lead":
      return executeLeadTool(
        { name, args } as Parameters<typeof executeLeadTool>[0],
        { supabase, tenantId, userId, accessibleTenantIds },
      );

    case "create_task":
      return executeCreateTask(
        args as Parameters<typeof executeCreateTask>[0],
        toolContext,
      );
    case "create_agent_task":
      return executeCreateAgentTask(
        args as Parameters<typeof executeCreateAgentTask>[0],
        toolContext,
      );
    case "list_my_agent_tasks":
      return executeListMyAgentTasks(
        args as Parameters<typeof executeListMyAgentTasks>[0],
        toolContext,
      );
    case "recall_recent_action":
      return executeRecallRecentAction(
        args as Parameters<typeof executeRecallRecentAction>[0],
        toolContext,
      );
    case "record_action_episode":
      return executeRecordActionEpisode(
        args as Parameters<typeof executeRecordActionEpisode>[0],
        toolContext,
      );
    case "search_tasks":
      return executeSearchTasks(
        args as Parameters<typeof executeSearchTasks>[0],
        toolContext,
      );
    case "list_tasks":
      return executeListTasks(
        args as Parameters<typeof executeListTasks>[0],
        toolContext,
      );
    case "update_task_status":
      return executeUpdateTaskStatus(
        args as Parameters<typeof executeUpdateTaskStatus>[0],
        toolContext,
      );
    case "list_clients":
      return listClients(args, {
        ...prepared.scope,
        supabase,
        tenantId,
        callerCampaignerId,
        humanRequesterUserId,
        surface,
      });
    case "get_client_info":
    case "add_client_update":
    case "set_campaign_table_active":
      return executeSetCampaignTableActive(
        args as Parameters<typeof executeSetCampaignTableActive>[0],
        toolContext,
      );

    case "send_message":
      return executeSendMessage(
        args as Parameters<typeof executeSendMessage>[0],
        toolContext,
      );
    case "search_entities":
      return executeSearchEntities(
        args as Parameters<typeof executeSearchEntities>[0],
        toolContext,
      );
    case "delegate_to_manus":
      return executeDelegateToManus(
        args as Parameters<typeof executeDelegateToManus>[0],
        toolContext,
      );

    case "send_message_to_manus":
      return executeSendMessageToManus(
        args as Parameters<typeof executeSendMessageToManus>[0],
        toolContext,
      );

    case "get_facebook_campaign_data":
      return executeGetFacebookCampaignData(
        args as Parameters<typeof executeGetFacebookCampaignData>[0],
        toolContext,
      );
    case "list_facebook_campaigns":
      return executeListFacebookCampaigns(
        args as Parameters<typeof executeListFacebookCampaigns>[0],
        toolContext,
      );
    // Legacy Meta mutate tools — enqueue to agent_approval_queue (never execute immediately).
    // Kept for skin compatibility; same gate as fb_pause / fb_update_budget / etc.

    case "toggle_facebook_campaign":
    case "update_facebook_budget":
    case "duplicate_facebook_campaign":
      return executeFacebookCampaignMutation(
        args as Parameters<typeof executeFacebookCampaignMutation>[0],
        toolContext,
      );
    case "analyze_facebook_campaign":
      return executeAnalyzeFacebookCampaign(
        args as Parameters<typeof executeAnalyzeFacebookCampaign>[0],
        toolContext,
      );
    case "list_facebook_ads":
      return executeListFacebookAds(
        args as Parameters<typeof executeListFacebookAds>[0],
        toolContext,
      );
    case "inspect_facebook_ad":
      return executeInspectFacebookAd(
        args as Parameters<typeof executeInspectFacebookAd>[0],
        toolContext,
      );

    case "fb_duplicate_ad_variants":
    case "duplicate_facebook_ad_variants":
      return executeDuplicateFacebookAdVariants(
        args as Parameters<typeof executeDuplicateFacebookAdVariants>[0],
        toolContext,
      );
    case "get_campaign_alerts":
      return executeGetCampaignAlerts(
        args as Parameters<typeof executeGetCampaignAlerts>[0],
        toolContext,
      );
    case "acknowledge_campaign_alert":
      return executeAcknowledgeCampaignAlert(
        args as Parameters<typeof executeAcknowledgeCampaignAlert>[0],
        toolContext,
      );
    case "resolve_campaign_alert":
      return executeResolveCampaignAlert(
        args as Parameters<typeof executeResolveCampaignAlert>[0],
        toolContext,
      );
    case "list_social_pages":
      return executeListSocialPages(
        args as Parameters<typeof executeListSocialPages>[0],
        toolContext,
      );
    case "sync_social_pages":
      return executeSyncSocialPages(
        args as Parameters<typeof executeSyncSocialPages>[0],
        toolContext,
      );
    case "publish_social_post":
      return executePublishSocialPost(
        args as Parameters<typeof executePublishSocialPost>[0],
        toolContext,
      );
    case "fetch_social_comments":
      return executeFetchSocialComments(
        args as Parameters<typeof executeFetchSocialComments>[0],
        toolContext,
      );
    case "list_social_comments":
      return executeListSocialComments(
        args as Parameters<typeof executeListSocialComments>[0],
        toolContext,
      );
    case "reply_to_social_comment":
    case "hide_social_comment":
      return executeHideSocialComment(
        args as Parameters<typeof executeHideSocialComment>[0],
        toolContext,
      );
    case "get_latest_campaign_pulse":
      return executeGetLatestCampaignPulse(
        args as Parameters<typeof executeGetLatestCampaignPulse>[0],
        toolContext,
      );
    case REFRESH_PULSE_TOOL_NAME:
      return executeRefreshCampaignPulseTool(
        args as Parameters<typeof executeRefreshCampaignPulseTool>[0],
        toolContext,
        (pulseArgs) =>
          executeTool(
            "get_latest_campaign_pulse",
            pulseArgs,
            supabase,
            tenantId,
            userId,
            callerCampaignerId,
            agentId,
            callerRole,
            callerManagedAgencyIds,
            callerPhone,
            waNotify,
            surface,
            conversationId,
          ),
      );
    case "analyze_campaign_performance":
      return executeAnalyzeCampaignPerformance(
        args as Parameters<typeof executeAnalyzeCampaignPerformance>[0],
        toolContext,
      );
    case "update_client_health":
      return executeUpdateClientHealth(
        args as Parameters<typeof executeUpdateClientHealth>[0],
        toolContext,
      );
    case "get_client_retention_scan":
      return executeGetClientRetentionScan(
        args as Parameters<typeof executeGetClientRetentionScan>[0],
        toolContext,
      );
    case "batch_update_client_health":
      return executeBatchUpdateClientHealth(
        args as Parameters<typeof executeBatchUpdateClientHealth>[0],
        toolContext,
      );
    case "create_social_post":
      return executeCreateSocialPost(
        args as Parameters<typeof executeCreateSocialPost>[0],
        toolContext,
      );

    // ============ MARKETING DEPARTMENT (work items / pipeline) ============
    case "list_marketing_work_items":
      return executeListMarketingWorkItems(
        args as Parameters<typeof executeListMarketingWorkItems>[0],
        toolContext,
      );
    case "get_marketing_work_item":
      return executeGetMarketingWorkItem(
        args as Parameters<typeof executeGetMarketingWorkItem>[0],
        toolContext,
      );
    case "create_marketing_work_item":
      return executeCreateMarketingWorkItem(
        args as Parameters<typeof executeCreateMarketingWorkItem>[0],
        toolContext,
      );
    case "handoff_marketing_work_item":
      return executeHandoffMarketingWorkItem(
        args as Parameters<typeof executeHandoffMarketingWorkItem>[0],
        toolContext,
      );
    case "update_marketing_work_item":
      return executeUpdateMarketingWorkItem(
        args as Parameters<typeof executeUpdateMarketingWorkItem>[0],
        toolContext,
      );

    case "generate_ad_image":
      return executeGenerateAdImage(
        args as Parameters<typeof executeGenerateAdImage>[0],
        toolContext,
      );
    // CLIENTS - full CRUD
    case "create_client":
    case "update_client":
    case "update_client_status":
      return executeClientRecordTool(
        { name, args } as Parameters<typeof executeClientRecordTool>[0],
        {
          ...prepared.scope,
          supabase,
          tenantId,
          callerCampaignerId,
          humanRequesterUserId,
          surface,
        },
      );

    // LEADS - full CRUD

    // TASKS - full CRUD
    case "update_task":
      return executeUpdateTask(
        args as Parameters<typeof executeUpdateTask>[0],
        toolContext,
      );
    case "delete_task":
      return executeDeleteTask(
        args as Parameters<typeof executeDeleteTask>[0],
        toolContext,
      );
    case "add_task_update":
      return executeAddTaskUpdate(
        args as Parameters<typeof executeAddTaskUpdate>[0],
        toolContext,
      );
    case "manage_task_collaborators":
      return executeManageTaskCollaborators(
        args as Parameters<typeof executeManageTaskCollaborators>[0],
        toolContext,
      );
    // CLIENT ONBOARDING
    case "create_onboarding":
      return executeCreateOnboarding(
        args as Parameters<typeof executeCreateOnboarding>[0],
        toolContext,
      );
    case "list_onboarding":
      return executeListOnboarding(
        args as Parameters<typeof executeListOnboarding>[0],
        toolContext,
      );
    case "update_onboarding_status":
      return executeUpdateOnboardingStatus(
        args as Parameters<typeof executeUpdateOnboardingStatus>[0],
        toolContext,
      );
    // CAMPAIGNERS
    case "list_campaigners":
      return executeListCampaigners(
        args as Parameters<typeof executeListCampaigners>[0],
        toolContext,
      );
    case "create_campaigner":
      return executeCreateCampaigner(
        args as Parameters<typeof executeCreateCampaigner>[0],
        toolContext,
      );
    // SALES PEOPLE
    case "list_sales_people":
      return executeListSalesPeople(
        args as Parameters<typeof executeListSalesPeople>[0],
        toolContext,
      );
    case "create_sales_person":
      return executeCreateSalesPerson(
        args as Parameters<typeof executeCreateSalesPerson>[0],
        toolContext,
      );
    // AGENCIES
    case "list_agencies":
      return executeListAgencies(
        args as Parameters<typeof executeListAgencies>[0],
        toolContext,
      );
    case "create_agency":
      return executeCreateAgency(
        args as Parameters<typeof executeCreateAgency>[0],
        toolContext,
      );
    // SUPPLIERS
    case "list_suppliers":
      return executeListSuppliers(
        args as Parameters<typeof executeListSuppliers>[0],
        toolContext,
      );
    case "create_supplier":
      return executeCreateSupplier(
        args as Parameters<typeof executeCreateSupplier>[0],
        toolContext,
      );
    // PRODUCTS
    case "list_products":
      return executeListProducts(
        args as Parameters<typeof executeListProducts>[0],
        toolContext,
      );
    case "create_product":
      return executeCreateProduct(
        args as Parameters<typeof executeCreateProduct>[0],
        toolContext,
      );
    // AUTOMATIONS
    case "list_automations":
      return executeListAutomations(
        args as Parameters<typeof executeListAutomations>[0],
        toolContext,
      );
    case "get_automation_details":
      return executeGetAutomationDetails(
        args as Parameters<typeof executeGetAutomationDetails>[0],
        toolContext,
      );
    case "toggle_automation":
    case "delete_automation":
    case "propose_automation_edit":
      return executeProposeAutomationEdit(
        args as Parameters<typeof executeProposeAutomationEdit>[0],
        toolContext,
      );
    case "inspect_meta_lead_forms":
      return executeInspectMetaLeadForms(
        args as Parameters<typeof executeInspectMetaLeadForms>[0],
        toolContext,
      );
    case "set_automation_meta_lead_form":
      return executeSetAutomationMetaLeadForm(
        args as Parameters<typeof executeSetAutomationMetaLeadForm>[0],
        toolContext,
      );
    case "create_meta_lead_form":
      return executeCreateMetaLeadForm(
        args as Parameters<typeof executeCreateMetaLeadForm>[0],
        toolContext,
      );
    // DASHBOARD STATS
    case "get_dashboard_stats":
      return executeGetDashboardStats(
        args as Parameters<typeof executeGetDashboardStats>[0],
        toolContext,
      );
    // MEMORY
    case "save_memory":
      return executeSaveMemory(
        args as Parameters<typeof executeSaveMemory>[0],
        toolContext,
      );
    case "recall_memory":
      return executeRecallMemory(
        args as Parameters<typeof executeRecallMemory>[0],
        toolContext,
      );
    case "recall_memory_fts":
      return executeRecallMemoryFts(
        args as Parameters<typeof executeRecallMemoryFts>[0],
        toolContext,
      );
    case "delete_memory":
      return executeDeleteMemory(
        args as Parameters<typeof executeDeleteMemory>[0],
        toolContext,
      );
    // KNOWLEDGE BASE
    case "kb_list_folder":
      return executeKbListFolder(
        args as Parameters<typeof executeKbListFolder>[0],
        toolContext,
      );
    case "kb_search":
      return executeKbSearch(
        args as Parameters<typeof executeKbSearch>[0],
        toolContext,
      );
    case "kb_open":
      return executeKbOpen(
        args as Parameters<typeof executeKbOpen>[0],
        toolContext,
      );
    case "kb_recall_conversation":
      return executeKbRecallConversation(
        args as Parameters<typeof executeKbRecallConversation>[0],
        toolContext,
      );
    case "kb_learn":
      return executeKbLearn(
        args as Parameters<typeof executeKbLearn>[0],
        toolContext,
      );
    // CHAT HISTORY
    case "get_chat_history":
      return getChatHistory(chatRead, args);
    case "search_conversation_history":
      return executeSearchConversationHistory(
        args as Parameters<typeof executeSearchConversationHistory>[0],
        toolContext,
        chatRead,
      );
    case "get_recent_inbound_messages":
      return getRecentInboundMessages(chatRead, args);
    // FINANCE
    case "list_finance":
      return executeListFinance(
        args as Parameters<typeof executeListFinance>[0],
        toolContext,
      );
    case "create_finance_entry":
      return executeCreateFinanceEntry(
        args as Parameters<typeof executeCreateFinanceEntry>[0],
        toolContext,
      );
    case "get_finance_summary":
      return executeGetFinanceSummary(
        args as Parameters<typeof executeGetFinanceSummary>[0],
        toolContext,
      );

    // ============ REAL ACCOUNTING MODULE (AccountingIntegrations) ============
    case "get_accounting_overview":
      return executeGetAccountingOverview(
        args as Parameters<typeof executeGetAccountingOverview>[0],
        toolContext,
      );
    case "get_client_retainer":
      return executeGetClientRetainer(
        args as Parameters<typeof executeGetClientRetainer>[0],
        toolContext,
      );
    case "list_one_time_incomes":
      return executeListOneTimeIncomes(
        args as Parameters<typeof executeListOneTimeIncomes>[0],
        toolContext,
      );
    case "list_income_payments":
      return executeListIncomePayments(
        args as Parameters<typeof executeListIncomePayments>[0],
        toolContext,
      );
    case "list_expense_payments":
      return executeListExpensePayments(
        args as Parameters<typeof executeListExpensePayments>[0],
        toolContext,
      );
    case "list_invoice_uploads":
      return executeListInvoiceUploads(
        args as Parameters<typeof executeListInvoiceUploads>[0],
        toolContext,
      );
    case "create_one_time_income":
    case "delete_one_time_income":
    case "record_income_payment":
    case "delete_income_payment":
    case "record_expense_payment":
    case "delete_expense_payment":
    case "update_client_retainer":
      return executeUpdateClientRetainer(
        args as Parameters<typeof executeUpdateClientRetainer>[0],
        toolContext,
      );
    // UPDATES
    case "list_updates":
      return executeListUpdates(
        args as Parameters<typeof executeListUpdates>[0],
        toolContext,
      );
    // GOALS
    case "create_goal":
      return executeCreateGoal(
        args as Parameters<typeof executeCreateGoal>[0],
        toolContext,
      );
    case "list_goals":
      return executeListGoals(
        args as Parameters<typeof executeListGoals>[0],
        toolContext,
      );
    case "find_execution_goal_duplicates":
      return executeFindExecutionGoalDuplicates(
        args as Parameters<typeof executeFindExecutionGoalDuplicates>[0],
        toolContext,
      );

    case "create_execution_goal":
    case "create_autonomous_goal":
      return executeCreateExecutionGoal(
        args as Parameters<typeof executeCreateExecutionGoal>[0],
        toolContext,
      );
    case "get_execution_goal_report":
      return executeGetExecutionGoalReport(
        args as Parameters<typeof executeGetExecutionGoalReport>[0],
        toolContext,
      );
    case "add_goal_milestone":
      return executeAddGoalMilestone(
        args as Parameters<typeof executeAddGoalMilestone>[0],
        toolContext,
      );
    case "add_goal_blocker":
      return executeAddGoalBlocker(
        args as Parameters<typeof executeAddGoalBlocker>[0],
        toolContext,
      );
    case "link_task_to_execution_goal":
      return executeLinkTaskToExecutionGoal(
        args as Parameters<typeof executeLinkTaskToExecutionGoal>[0],
        toolContext,
      );
    case "get_autonomous_goal_status":
      return executeGetAutonomousGoalStatus(
        args as Parameters<typeof executeGetAutonomousGoalStatus>[0],
        toolContext,
      );
    // AGENT TASK OWNERSHIP
    case "take_task":
      return executeTakeTask(
        args as Parameters<typeof executeTakeTask>[0],
        toolContext,
      );
    case "assign_task_to_cursor":
      return executeAssignTaskToCursor(
        args as Parameters<typeof executeAssignTaskToCursor>[0],
        toolContext,
      );
    case "find_dev_task_duplicates":
      return executeFindDevTaskDuplicates(
        args as Parameters<typeof executeFindDevTaskDuplicates>[0],
        toolContext,
      );
    case "create_dev_task":
      return executeCreateDevTask(
        args as Parameters<typeof executeCreateDevTask>[0],
        toolContext,
      );
    case "approve_dev_task":
      return executeApproveDevTask(
        args as Parameters<typeof executeApproveDevTask>[0],
        toolContext,
      );
    case "dispatch_dev_task":
      return executeDispatchDevTask(
        args as Parameters<typeof executeDispatchDevTask>[0],
        toolContext,
      );
    case "list_dev_tasks":
      return executeListDevTasks(
        args as Parameters<typeof executeListDevTasks>[0],
        toolContext,
      );
    case "update_dev_task":
      return executeUpdateDevTask(
        args as Parameters<typeof executeUpdateDevTask>[0],
        toolContext,
      );
    case "attach_dev_task_session":
      return executeAttachDevTaskSession(
        args as Parameters<typeof executeAttachDevTaskSession>[0],
        toolContext,
      );
    case "complete_task_step":
      return executeCompleteTaskStep(
        args as Parameters<typeof executeCompleteTaskStep>[0],
        toolContext,
      );
    case "prioritize_tasks":
      return executePrioritizeTasks(
        args as Parameters<typeof executePrioritizeTasks>[0],
        toolContext,
      );
    // FACEBOOK AD ACCOUNTS
    case "list_facebook_ad_accounts":
      return executeListFacebookAdAccounts(
        args as Parameters<typeof executeListFacebookAdAccounts>[0],
        toolContext,
      );
    case "create_facebook_report_table":
      return executeCreateFacebookReportTable(
        args as Parameters<typeof executeCreateFacebookReportTable>[0],
        toolContext,
      );
    case "verify_report_vs_meta":
      return executeVerifyReportVsMeta(
        args as Parameters<typeof executeVerifyReportVsMeta>[0],
        toolContext,
      );
    case "get_reconciliation_status":
      return executeGetReconciliationStatus(
        args as Parameters<typeof executeGetReconciliationStatus>[0],
        toolContext,
      );
    case "check_ad_accounts_health":
      return executeCheckAdAccountsHealth(
        args as Parameters<typeof executeCheckAdAccountsHealth>[0],
        toolContext,
      );
    case "list_unconnected_clients":
      return executeListUnconnectedClients(
        args as Parameters<typeof executeListUnconnectedClients>[0],
        toolContext,
      );
    case "list_integrations":
      return executeListIntegrations(
        args as Parameters<typeof executeListIntegrations>[0],
        toolContext,
      );
    case "toggle_integration":
      return executeToggleIntegration(
        args as Parameters<typeof executeToggleIntegration>[0],
        toolContext,
      );
    case "list_agents":
      return executeListAgents(
        args as Parameters<typeof executeListAgents>[0],
        toolContext,
      );
    case "create_agent":
      return executeCreateAgent(
        args as Parameters<typeof executeCreateAgent>[0],
        toolContext,
      );
    case "update_agent":
      return executeUpdateAgent(
        args as Parameters<typeof executeUpdateAgent>[0],
        toolContext,
      );
    case "delegate_to_github_agent":
      return executeDelegateToGithubAgent(
        args as Parameters<typeof executeDelegateToGithubAgent>[0],
        toolContext,
      );
    case "create_whatsapp_instance":
      return executeCreateWhatsappInstance(
        args as Parameters<typeof executeCreateWhatsappInstance>[0],
        toolContext,
      );
    case "get_whatsapp_qr_link":
      return executeGetWhatsappQrLink(
        args as Parameters<typeof executeGetWhatsappQrLink>[0],
        toolContext,
      );
    case "get_whatsapp_status":
      return executeGetWhatsappStatus(
        args as Parameters<typeof executeGetWhatsappStatus>[0],
        toolContext,
      );
    case "send_whatsapp_via_gateway":
      return executeSendWhatsappViaGateway(
        args as Parameters<typeof executeSendWhatsappViaGateway>[0],
        toolContext,
      );
    // ===========================
    // HERMES SKILLS SYSTEM
    // ===========================
    case "get_carmen_skins":
      return executeGetCarmenSkins(
        args as Parameters<typeof executeGetCarmenSkins>[0],
        toolContext,
      );
    case "recall_skills":
      return executeRecallSkills(
        args as Parameters<typeof executeRecallSkills>[0],
        toolContext,
      );
    case "create_skill":
      return executeCreateSkill(
        args as Parameters<typeof executeCreateSkill>[0],
        toolContext,
      );
    case "update_skill":
      return executeUpdateSkill(
        args as Parameters<typeof executeUpdateSkill>[0],
        toolContext,
      );
    case "delegate_to_subagent":
      return executeDelegateToSubagent(
        args as Parameters<typeof executeDelegateToSubagent>[0],
        toolContext,
      );

    case "get_subagent_result":
      return executeGetSubagentResult(
        args as Parameters<typeof executeGetSubagentResult>[0],
        toolContext,
      );

    case "delegate_parallel":
      return executeDelegateParallel(
        args as Parameters<typeof executeDelegateParallel>[0],
        toolContext,
      );

    case "get_batch_results":
      return executeGetBatchResults(
        args as Parameters<typeof executeGetBatchResults>[0],
        toolContext,
      );

    case "propose_automation":
      return executeProposeAutomation(
        args as Parameters<typeof executeProposeAutomation>[0],
        toolContext,
      );

    // ============ MEDIA LIBRARY ============
    case "save_media_from_chat":
      return executeSaveMediaFromChat(
        args as Parameters<typeof executeSaveMediaFromChat>[0],
        toolContext,
      );
    case "list_client_media":
      return executeListClientMedia(
        args as Parameters<typeof executeListClientMedia>[0],
        toolContext,
      );

    // ============ APPROVAL HELPERS ============
    case "list_pending_approvals":
      return executeListPendingApprovals(
        args as Parameters<typeof executeListPendingApprovals>[0],
        toolContext,
      );
    case "execute_pending_approval":
      return executeExecutePendingApproval(
        args as Parameters<typeof executeExecutePendingApproval>[0],
        toolContext,
      );
    case "reject_pending_approval":
      return executeRejectPendingApproval(
        args as Parameters<typeof executeRejectPendingApproval>[0],
        toolContext,
      );

    // ============ FB ADS — all create approval rows, return pending ============

    case "fb_create_campaign":
    case "fb_create_adset":
    case "fb_create_ad":
    case "fb_create_creative_from_media":
    case "fb_replace_lead_form":
    case "fb_update_budget":
    case "fb_pause":
    case "fb_resume":
    case "gads_pause":
    case "gads_resume":
    case "gads_update_budget":
      return queueAdActionApproval(
        args as Parameters<typeof queueAdActionApproval>[0],
        toolContext,
      );

    // ============ GOOGLE ADS — READ TOOLS ============
    case "list_google_ad_accounts":
      return executeListGoogleAdAccounts(
        args as Parameters<typeof executeListGoogleAdAccounts>[0],
        toolContext,
      );

    case "list_google_campaigns":
      return executeListGoogleCampaigns(
        args as Parameters<typeof executeListGoogleCampaigns>[0],
        toolContext,
      );

    case "create_google_ads_report_table":
      return executeCreateGoogleAdsReportTable(
        args as Parameters<typeof executeCreateGoogleAdsReportTable>[0],
        toolContext,
      );

    case "sync_google_ads_report":
    case "sync_facebook_insights":
      return executeSyncFacebookInsights(
        args as Parameters<typeof executeSyncFacebookInsights>[0],
        toolContext,
      );

    case "connect_google_ads_account":
      return executeConnectGoogleAdsAccount(
        args as Parameters<typeof executeConnectGoogleAdsAccount>[0],
        toolContext,
      );

    case "connect_client_meta_ad_account":
      return executeConnectClientMetaAdAccount(
        args as Parameters<typeof executeConnectClientMetaAdAccount>[0],
        toolContext,
      );

    // ============ SCHEDULES ============
    case "schedule_campaign_toggle":
      return executeScheduleCampaignToggle(
        args as Parameters<typeof executeScheduleCampaignToggle>[0],
        toolContext,
      );
    case "list_campaign_schedules":
      return executeListCampaignSchedules(
        args as Parameters<typeof executeListCampaignSchedules>[0],
        toolContext,
      );
    case "cancel_campaign_schedule":
      return executeCancelCampaignSchedule(
        args as Parameters<typeof executeCancelCampaignSchedule>[0],
        toolContext,
      );

    // ===========================
    // BROADCAST (דיוור)
    // ===========================
    case "list_broadcasts":
      return executeListBroadcasts(
        args as Parameters<typeof executeListBroadcasts>[0],
        toolContext,
      );
    case "create_broadcast":
      return executeCreateBroadcast(
        args as Parameters<typeof executeCreateBroadcast>[0],
        toolContext,
      );
    case "send_broadcast_now":
      return executeSendBroadcastNow(
        args as Parameters<typeof executeSendBroadcastNow>[0],
        toolContext,
      );
    case "schedule_broadcast":
      return executeScheduleBroadcast(
        args as Parameters<typeof executeScheduleBroadcast>[0],
        toolContext,
      );
    case "cancel_broadcast":
      return executeCancelBroadcast(
        args as Parameters<typeof executeCancelBroadcast>[0],
        toolContext,
      );
    case "list_wa_groups":
      return executeListWaGroups(
        args as Parameters<typeof executeListWaGroups>[0],
        toolContext,
      );

    // ============ CALENDAR INVITES ============
    case "send_calendar_invite":
      return executeSendCalendarInvite(
        args as Parameters<typeof executeSendCalendarInvite>[0],
        toolContext,
      );

    case "list_calendar_events":
      return executeListCalendarEvents(
        args as Parameters<typeof executeListCalendarEvents>[0],
        toolContext,
      );

    case "update_calendar_invite":
      return executeUpdateCalendarInvite(
        args as Parameters<typeof executeUpdateCalendarInvite>[0],
        toolContext,
      );

    case "cancel_calendar_invite":
      return executeCancelCalendarInvite(
        args as Parameters<typeof executeCancelCalendarInvite>[0],
        toolContext,
      );

    // ============ MEETING BOT ============
    case "join_meeting_for_client":
      return executeJoinMeetingForClient(
        args as Parameters<typeof executeJoinMeetingForClient>[0],
        toolContext,
      );

    case "get_meeting_bot_status":
      return executeGetMeetingBotStatus(
        args as Parameters<typeof executeGetMeetingBotStatus>[0],
        toolContext,
      );

    // ============ OPENAI BILLING (super_admin) ============
    case "get_openai_billing_status":
      return executeGetOpenaiBillingStatus(
        args as Parameters<typeof executeGetOpenaiBillingStatus>[0],
        toolContext,
      );

    // ============ STAFF / CAMPAIGNER WHATSAPP ============
    case "lookup_staff_whatsapp":
      return executeLookupStaffWhatsapp(
        args as Parameters<typeof executeLookupStaffWhatsapp>[0],
        toolContext,
      );

    case "send_whatsapp_to_staff":
    case "send_message_to_campaigner":
      return executeSendMessageToCampaigner(
        args as Parameters<typeof executeSendMessageToCampaigner>[0],
        toolContext,
      );

    // ============ MASKYOO CALLS REPORTING ============
    case "get_maskyoo_calls_report":
      return executeGetMaskyooCallsReport(
        args as Parameters<typeof executeGetMaskyooCallsReport>[0],
        toolContext,
      );

    case "sync_maskyoo_cdr":
      return executeSyncMaskyooCdr(
        args as Parameters<typeof executeSyncMaskyooCdr>[0],
        toolContext,
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ===========================
// MAIN HANDLER
// ===========================
import { requireAuth } from "../_shared/security.ts";
import type { Surface } from "./surface.ts";
import { bindRunAgentCaller } from "./caller-trust.ts";
import { runTenantDenied } from "./run-tenant-access.ts";

import { fastLaneInstructions } from "./fast-lane/instructions.ts";
import {
  answerFast,
  type ChatTurn,
  type FastTarget,
} from "./fast-lane/answer.ts";
import { loadOrgBrief } from "../_shared/carmen/org-brief/brief.ts";
import { type FastLaneCaller, fastLaneBriefScope } from "./fast-lane/scope.ts";

// Emit function used by the streaming wrapper to push SSE events to the client.
// In non-streaming mode it's a no-op.
type Emit = ((obj: unknown) => void) | undefined;

async function handleRunAgent(
  bodyJson: any,
  surface: Surface,
  emit: Emit,
  brainEngine?: Extract<BrainEngine, { kind: "connections" }>,
  request: {
    /** How the request was authenticated (requireAuth): a signed-in user, or a service call. */
    authKind?: string;
    /** The browser's Origin header, for full links back to the app the chat runs on. */
    origin?: string | null;
  } = {},
  /** The tenant's OpenRouter brain, the last link of Carmen's own engine when allowed. */
  internalTail?: () => Promise<BrainEngineTarget[]>,
): Promise<Response> {
  return (await runOrchestratedAgent(
    { bodyJson, surface, emit, brainEngine, request, internalTail },
    {
      executeTool,
      tryFastLane,
      saveConversationTurn,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      corsHeaders,
      CORE_TOOLS,
      createClient,
    },
  )) as Response;
}

/** A chat turn the fast lane may answer, with what it needs to save the reply. */
type FastLaneRequest = {
  tenantId: string;
  userId: string | null;
  callerName: string | null;
  agentId: string;
  agentName: string;
  /** The AIOS chat's conversation; WhatsApp keeps its own history. */
  conversationId: string | null;
  history: Array<ChatTurn>;
  message: string;
  surface: Surface;
  caller: FastLaneCaller;
};

/**
 * Lets a quick model answer the turn (fast-lane/). Returns the run's response when it answered,
 * or null when it handed the turn over, failed or has no model, so the full brain runs.
 */
async function tryFastLane(
  supabase: AgentDatabaseClient,
  emit: Emit,
  turn: FastLaneRequest,
): Promise<Response | null> {
  const startedAt = Date.now();
  const [target, brief, addressLine] = await Promise.all([
    fastLaneTarget(supabase, turn.tenantId),
    fastLaneBriefScope(supabase, turn.caller).then((scope) =>
      loadOrgBrief(supabase, turn.tenantId, new Date(), scope),
    ),
    callerAddressLine(supabase, turn.userId, turn.callerName),
  ]);
  if (!target) {
    return null;
  }
  const answer = await answerFast({
    target,
    instructions: fastLaneInstructions({
      agentName: turn.agentName,
      addressLine,
      brief,
      now: new Date(),
    }),
    history: turn.history,
    message: turn.message,
    onText: (content) => emit?.({ type: "token", content }),
  });
  const durationMs = Date.now() - startedAt;
  if (answer.kind === "escalate") {
    console.log(
      `[AGENT] fast lane handed over (${answer.reason}) after ${durationMs}ms`,
    );
    // Words it already showed stay; the full answer starts on its own paragraph.
    if (answer.shown) {
      emit?.({ type: "token", content: "\n\n" });
    }
    return null;
  }
  console.log(
    `[AGENT] fast lane answered in ${durationMs}ms (${target.label})`,
  );
  if (turn.conversationId && turn.userId) {
    await saveConversationTurn(supabase, {
      ...turn,
      userId: turn.userId,
      conversationId: turn.conversationId,
      answer: answer.text,
    });
  }
  const tokensIn = answer.usage?.prompt_tokens ?? 0;
  const tokensOut = answer.usage?.completion_tokens ?? 0;
  const { error } = await supabase.from("agent_action_log").insert({
    tenant_id: turn.tenantId,
    agent_id: turn.agentId,
    action_type: "agent_turn",
    status: "success",
    action_details: {
      surface: turn.surface,
      fast_lane: true,
      command_preview: turn.message.slice(0, 240),
      tools_used: [],
      tool_count: 0,
      output_preview: answer.text.slice(0, 600),
    },
    user_id: turn.userId,
    tool_calls: 0,
    model: target.label,
    duration_ms: durationMs,
    tokens_in: tokensIn || null,
    tokens_out: tokensOut || null,
    cost_usd: estimateLLMCostUSD(target.label, tokensIn, tokensOut),
  });
  if (error) {
    console.error("[AGENT] action_log insert failed:", error.message);
  }
  return new Response(
    JSON.stringify({
      success: true,
      output: answer.text,
      agent_name: turn.agentName,
      model: target.label,
      execution_time_ms: durationMs,
      tools_used: [],
      tool_log: [],
      conversation_id: turn.conversationId,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/** The first fast model the tenant has a key for that can stream, or null. */
async function fastLaneTarget(
  supabase: AgentDatabaseClient,
  tenantId: string,
): Promise<(FastTarget & { label: string }) | null> {
  for (const label of FAST_LANE_MODELS) {
    try {
      return { ...(await resolveLLMTarget(supabase, tenantId, label)), label };
    } catch {
      /* no key for this provider: try the next */
    }
  }
  return null;
}

/** Saves the user's message and the answer to the conversation (last 60 messages). */
async function saveConversationTurn(
  supabase: AgentDatabaseClient,
  turn: {
    tenantId: string;
    userId: string;
    conversationId: string;
    history: Array<ChatTurn>;
    message: string;
    answer: string;
  },
): Promise<void> {
  const messages = [
    ...turn.history,
    { role: "user", content: turn.message },
    { role: "assistant", content: turn.answer },
  ].slice(-60);
  const { error } = await supabase
    .from("ai_conversations")
    .update({ messages, updated_at: new Date().toISOString() })
    .eq("id", turn.conversationId)
    .eq("user_id", turn.userId)
    .eq("tenant_id", turn.tenantId);
  if (error) {
    console.error("[AGENT] conversation persistence failed:", error.message);
  }
}

// ===========================
// DIRECT TOOL MODE (carmen-tools-mcp)
// ===========================
// Coding agents (Claude Direct / Cursor Direct) call Carmen's tools without her LLM.
// Same executeTool, same role scoping and per-tool approval gates; tools that would
// act immediately but are sensitive are queued for approval instead (see
// _shared/carmen-direct-tools.mjs). Service-role callers only.
async function handleDirectTool(bodyJson: any): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  const req = bodyJson.direct_tool || {};
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const caller =
    String(req.caller || "agent")
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 40) || "agent";

  if (req.action === "execute_approved") {
    const { data: row } = await supabase
      .from("agent_approval_queue")
      .select("*")
      .eq("id", req.approval_id)
      .maybeSingle();
    if (!row || row.action_type !== "agent_direct_tool")
      return json({ error: "approval_not_found" }, 404);
    if (row.status === "executed" || row.status === "rejected")
      return json({ error: `approval_${row.status}` }, 409);
    const scope = await resolveDirectCaller(
      supabase,
      row.tenant_id,
      row.requested_by,
    );
    let result: any;
    let failed = false;
    try {
      result = await executeTool(
        row.tool_name,
        row.tool_input || {},
        supabase,
        row.tenant_id,
        scope.userId,
        scope.campaignerId,
        row.agent_id,
        scope.role,
        scope.managedAgencyIds,
        null,
        null,
        "agent_direct",
        null,
        { outOfBand: true },
      );
      failed = !!result?.error || !!result?.pending_approval;
    } catch (e: any) {
      failed = true;
      result = { error: String(e?.message ?? e) };
    }
    await supabase
      .from("agent_approval_queue")
      .update({
        status: failed ? "failed" : "executed",
        approved_by: asUuidOrNull(req.approved_by) || row.requested_by,
        approved_at: row.approved_at || new Date().toISOString(),
        executed_at: new Date().toISOString(),
        execution_result: result,
      })
      .eq("id", row.id);
    return json({ success: !failed, result }, failed ? 400 : 200);
  }

  const tenantId = String(bodyJson.tenant_id || "");
  const userId = asUuidOrNull(bodyJson.user_id);
  if (!tenantId || !userId)
    return json({ error: "tenant_id and user_id are required" }, 400);
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id, allowed_tools, disabled_tools")
    .eq("tenant_id", tenantId)
    .or("name.ilike.%carmen%,name.ilike.%כרמן%")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!agent) return json({ error: "No active Carmen agent for tenant" }, 404);
  const scope = await resolveDirectCaller(supabase, tenantId, userId);
  const disabledTools: string[] = agent.disabled_tools || [];
  // The same pulse tools as Carmen's chat, past a narrow allowed_tools.
  const pool = keepCarmenPulseTools(
    directToolPool(ALL_TOOLS as any[], {
      allowedTools: agent.allowed_tools || [],
      disabledTools,
      isManager: !!scope.role && MANAGER_ROLES.includes(scope.role),
    }),
    ALL_TOOLS,
    { isCarmen: true, disabledTools },
  );

  if (req.action === "list") {
    return json({
      tools: pool.map((t: any) => ({
        ...t,
        requires_approval: classifyDirectTool(t.name) === "approval",
      })),
    });
  }
  if (req.action !== "call")
    return json({ error: "unknown direct_tool action" }, 400);

  const name = String(req.name || "");
  const args = req.args && typeof req.args === "object" ? req.args : {};
  if (!pool.some((t: any) => t.name === name))
    return json({ error: `tool_not_available: ${name}` }, 403);

  if (classifyDirectTool(name) === "approval") {
    const { data: aq, error: aqErr } = await supabase
      .from("agent_approval_queue")
      .insert({
        tenant_id: tenantId,
        agent_id: agent.id,
        requested_by: userId,
        action_type: "agent_direct_tool",
        title: `${caller} → ${name}`,
        description: `${caller} ביקש להפעיל את ${name} ישירות — דורש אישור`,
        tool_name: name,
        tool_input: args,
        context: { caller, caller_role: scope.role },
        status: "pending",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (aqErr) return json({ error: aqErr.message }, 500);
    return json({
      result: {
        pending_approval: true,
        approval_id: aq.id,
        message:
          "Queued for David's approval (AIOS approvals). Do not retry or work around it; tell David what you queued.",
      },
    });
  }

  try {
    const result = await executeTool(
      name,
      args,
      supabase,
      tenantId,
      userId,
      scope.campaignerId,
      agent.id,
      scope.role,
      scope.managedAgencyIds,
      null,
      null,
      "agent_direct",
      null,
    );
    return json({ result });
  } catch (e: any) {
    return json({ result: { error: String(e?.message ?? e) } });
  }
}

async function resolveDirectCaller(
  supabase: any,
  tenantId: string,
  userId: string | null,
) {
  if (!userId)
    return {
      userId: null,
      role: null,
      campaignerId: null,
      managedAgencyIds: [] as string[],
    };
  const [{ data: roles }, { data: prof }] = await Promise.all([
    // Roles in this tenant plus global (tenant_id null) roles only — never another tenant's.
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    supabase
      .from("profiles")
      .select("campaigner_id")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const roleList = (roles || []).map((r: any) => r.role);
  const order = [
    "super_admin",
    "owner",
    "agency_owner",
    "agency_manager",
    "team_manager",
    "campaigner",
    "sales_person",
    "seo",
    "viewer",
  ];
  const role = order.find((r) => roleList.includes(r)) || null;
  let managedAgencyIds: string[] = [];
  if (role === "team_manager" || role === "agency_manager") {
    const { data: mng } = await supabase
      .from("user_managed_agencies")
      .select("agency_id")
      .eq("user_id", userId);
    managedAgencyIds = (mng || []).map((m: any) => m.agency_id);
  }
  return {
    userId,
    role,
    campaignerId: (prof?.campaigner_id as string | null) || null,
    managedAgencyIds,
  };
}

/**
 * The answer when the picked brain may not run as Carmen (not approved for
 * client data, or not set up): Carmen says why, instead of a bare error.
 */
function refusedBrainResponse(message: string, wantStream: boolean): Response {
  if (!wantStream)
    return new Response(
      JSON.stringify({ success: false, output: message, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  const sse = [
    { type: "token", content: message },
    { type: "done", success: false, output: message, error: message },
  ]
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join("");
  return new Response(sse, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const auth = await requireAuth(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let bodyJson: any = {};
  try {
    bodyJson = await req.json();
  } catch {
    /* ignore */
  }
  // Never trust a browser-supplied identity. A user JWT runs as that user, without
  // the caller phone (lead_data), WhatsApp target (wa_notify), whatsapp surface or
  // admin config — approvals are bound to the identity those fields would set.
  // Service-to-service calls keep their explicit user (./caller-trust.ts).
  bindRunAgentCaller(bodyJson, auth);

  if (bodyJson.direct_tool) {
    if (auth.kind !== "service") {
      return new Response(
        JSON.stringify({ error: "direct_tool is service-only" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return await handleDirectTool(bodyJson);
  }

  // A signed-in user runs only in a tenant they belong to (AIO-306), checked
  // before any brain, key or tool of that tenant is read.
  const guardClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const tenantDenied = await runTenantDenied(guardClient, auth, bodyJson);
  if (tenantDenied) {
    return new Response(JSON.stringify({ error: tenantDenied }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const wantStream = bodyJson.stream === true;
  const surface: Surface =
    bodyJson.surface === "aios"
      ? "aios"
      : bodyJson.surface === "task"
        ? "task"
        : bodyJson.surface === "whatsapp"
          ? "whatsapp"
          : bodyJson.surface === "grok_bot"
            ? "grok_bot"
            : "internal_chat";

  // The brain the user picked runs Carmen's loop (_shared/carmen/brain-engine);
  // the route, grant and keys are all read here, never taken from the body.
  const engine = await resolveWorkshopAwareEngine(
    guardClient,
    auth,
    bodyJson,
    async () =>
      !(await internalBrainDenied(guardClient, auth, {
        tenantId: bodyJson.tenant_id,
        agentId: bodyJson.agent_id,
      })),
  );
  if (engine.kind === "denied") return brainDenied("brain");
  if (engine.kind === "refused")
    return refusedBrainResponse(engine.message, wantStream);
  // Per-user Carmen permissions, on every surface (_shared/carmen/brain-guard).
  // A picked model brain was checked against its own grant above.
  if (engine.kind === "internal") {
    const denied = await internalBrainDenied(guardClient, auth, {
      tenantId: bodyJson.tenant_id,
      agentId: bodyJson.agent_id,
    });
    if (denied) return denied;
  }
  const brainEngine = engine.kind === "connections" ? engine : undefined;
  // Read only when Carmen's own engine runs: the OpenRouter brain as its last link, under
  // that brain's own access rules.
  const internalTail = () => openRouterTail(guardClient, auth, bodyJson);

  if (!wantStream) {
    return await handleRunAgent(
      bodyJson,
      surface,
      undefined,
      brainEngine,
      { authKind: auth.kind, origin: req.headers.get("origin") },
      internalTail,
    );
  }

  // Streaming mode: AIOS-compatible SSE.
  // Events emitted: {type:'tool_call',tool,args}, {type:'token',content}, {type:'done',...}
  // The turn keeps running after the client disconnects (closed chat panel,
  // reloaded tab), and the server saves the answer (_shared/carmen/background-reply).
  const enc = new TextEncoder();
  const recorder = createReplyRecorder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: any) => {
        recorder.observe(obj);
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* client gone: keep working, the reply is saved below */
        }
      };
      const turn = (async () => {
        let final: any = {};
        try {
          const resp = await handleRunAgent(
            bodyJson,
            surface,
            emit,
            brainEngine,
            {
              authKind: auth.kind,
              origin: req.headers.get("origin"),
            },
            internalTail,
          );
          try {
            final = await resp.json();
          } catch {
            /* ignore */
          }
          emit({
            type: "done",
            success: final.success !== false,
            output: final.output,
            tools_used: final.tools_used,
            error: final.error,
          });
        } catch (e: any) {
          emit({ type: "error", error: e?.message || String(e) });
          emit({
            type: "done",
            success: false,
            error: e?.message || String(e),
          });
        } finally {
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        }
        // Only the chat that sent a reply_key gets its answer saved here; the
        // other streaming callers keep saving their own replies.
        const replyKey = parseReplyKey(bodyJson.reply_key);
        if (
          surface === "internal_chat" &&
          replyKey &&
          recorder.conversationId
        ) {
          await saveCarmenReply(
            createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
            {
              conversationId: recorder.conversationId,
              content: recorder.reply(final.output),
              replyKey,
            },
          ).catch((e) => console.error("[carmen] reply save failed:", e));
        }
      })();
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(turn);
      await turn;
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});

export type RunDependencies = {
  executeTool: typeof executeTool;
  tryFastLane: typeof tryFastLane;
  saveConversationTurn: typeof saveConversationTurn;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  corsHeaders: typeof corsHeaders;
  CORE_TOOLS: typeof CORE_TOOLS;
  createClient: (url: string, key: string) => AgentDatabaseClient;
};
