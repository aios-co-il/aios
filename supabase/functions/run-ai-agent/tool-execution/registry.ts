import { adminToolRoutes } from "./routes/admin-tool.ts";
import { leadToolsRoutes } from "./routes/lead-tools.ts";
import { taskCreationRoutes } from "./routes/task-creation.ts";
import { taskQueriesRoutes } from "./routes/task-queries.ts";
import { memoryRoutes } from "./routes/memory.ts";
import { taskMutationsRoutes } from "./routes/task-mutations.ts";
import { clientListRoutes } from "./routes/client-list.ts";
import { messagingRoutes } from "./routes/messaging.ts";
import { delegationRoutes } from "./routes/delegation.ts";
import { metaCampaignRoutes } from "./routes/meta-campaign.ts";
import { campaignAlertRoutes } from "./routes/campaign-alert.ts";
import { socialPublishingRoutes } from "./routes/social-publishing.ts";
import { pulseRoutes } from "./routes/pulse.ts";
import { marketingWorkRoutes } from "./routes/marketing-work.ts";
import { clientRecordsRoutes } from "./routes/client-records.ts";
import { onboardingRoutes } from "./routes/onboarding.ts";
import { businessRecordRoutes } from "./routes/business-record.ts";
import { automationToolRoutes } from "./routes/automation-tool.ts";
import { adReportRoutes } from "./routes/ad-report.ts";
import { knowledgeRoutes } from "./routes/knowledge.ts";
import { readersRoutes } from "./routes/readers.ts";
import { conversationRoutes } from "./routes/conversation.ts";
import { financeRoutes } from "./routes/finance.ts";
import { accountingApprovalRoutes } from "./routes/accounting-approval.ts";
import { goalRoutes } from "./routes/goal.ts";
import { developerTaskRoutes } from "./routes/developer-task.ts";
import { skillToolRoutes } from "./routes/skill-tool.ts";
import { mediaRecordRoutes } from "./routes/media-record.ts";
import { approvalToolRoutes } from "./routes/approval-tool.ts";
import { adActionRoutes } from "./routes/ad-action.ts";
import { googleAdRoutes } from "./routes/google-ad.ts";
import { campaignScheduleRoutes } from "./routes/campaign-schedule.ts";
import { broadcastRoutes } from "./routes/broadcast.ts";
import { calendarToolRoutes } from "./routes/calendar-tool.ts";
import { billingToolRoutes } from "./routes/billing-tool.ts";
import type { ToolRoute } from "./route.ts";

/** Exact legacy switch keys, composed by responsibility. */
export const TOOL_ROUTES: Record<string, ToolRoute> = {
  ...adminToolRoutes,
  ...leadToolsRoutes,
  ...taskCreationRoutes,
  ...taskQueriesRoutes,
  ...memoryRoutes,
  ...taskMutationsRoutes,
  ...clientListRoutes,
  ...messagingRoutes,
  ...delegationRoutes,
  ...metaCampaignRoutes,
  ...campaignAlertRoutes,
  ...socialPublishingRoutes,
  ...pulseRoutes,
  ...marketingWorkRoutes,
  ...clientRecordsRoutes,
  ...onboardingRoutes,
  ...businessRecordRoutes,
  ...automationToolRoutes,
  ...adReportRoutes,
  ...knowledgeRoutes,
  ...readersRoutes,
  ...conversationRoutes,
  ...financeRoutes,
  ...accountingApprovalRoutes,
  ...goalRoutes,
  ...developerTaskRoutes,
  ...skillToolRoutes,
  ...mediaRecordRoutes,
  ...approvalToolRoutes,
  ...adActionRoutes,
  ...googleAdRoutes,
  ...campaignScheduleRoutes,
  ...broadcastRoutes,
  ...calendarToolRoutes,
  ...billingToolRoutes,
};
