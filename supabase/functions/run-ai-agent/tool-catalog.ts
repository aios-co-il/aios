import { leadCreationTools } from "./lead-tool-schemas.ts";
import { tasksTools } from "./tool-schemas/tasks.ts";
import { agentTasksTools } from "./tool-schemas/agent-tasks.ts";
import { taskListTools } from "./tool-schemas/task-list.ts";
import { clientsTools } from "./tool-schemas/clients.ts";
import { messagingTools } from "./tool-schemas/messaging.ts";
import { searchTools } from "./tool-schemas/search.ts";
import { delegationTools } from "./tool-schemas/delegation.ts";
import { facebookInspectionTools } from "./tool-schemas/facebook-inspection.ts";
import { socialAlertsTools } from "./tool-schemas/social-alerts.ts";
import { campaignPulseTools } from "./tool-schemas/campaign-pulse.ts";
import { callReportingTools } from "./tool-schemas/call-reporting.ts";
import { clientMutationsTools } from "./tool-schemas/client-mutations.ts";
import { taskMutationsTools } from "./tool-schemas/task-mutations.ts";
import { onboardingTools } from "./tool-schemas/onboarding.ts";
import { campaignersTools } from "./tool-schemas/campaigners.ts";
import { salesPeopleTools } from "./tool-schemas/sales-people.ts";
import { agenciesTools } from "./tool-schemas/agencies.ts";
import { suppliersTools } from "./tool-schemas/suppliers.ts";
import { productsTools } from "./tool-schemas/products.ts";
import { automationTools } from "./tool-schemas/automation.ts";
import { metaLeadFormsTools } from "./tool-schemas/meta-lead-forms.ts";
import { reportingTools } from "./tool-schemas/reporting.ts";
import { socialTools } from "./tool-schemas/social.ts";
import { marketingTools } from "./tool-schemas/marketing.ts";
import { adImagesTools } from "./tool-schemas/ad-images.ts";
import { memoryTools } from "./tool-schemas/memory.ts";
import { knowledgeTools } from "./tool-schemas/knowledge.ts";
import { chatTools } from "./tool-schemas/chat.ts";
import { financeTools } from "./tool-schemas/finance.ts";
import { accountingTools } from "./tool-schemas/accounting.ts";
import { accountingPaymentsTools } from "./tool-schemas/accounting-payments.ts";
import { clientUpdatesTools } from "./tool-schemas/client-updates.ts";
import { goalsTools } from "./tool-schemas/goals.ts";
import { goalProgressTools } from "./tool-schemas/goal-progress.ts";
import { taskOwnershipTools } from "./tool-schemas/task-ownership.ts";
import { taskProgressTools } from "./tool-schemas/task-progress.ts";
import { facebookAccountsTools } from "./tool-schemas/facebook-accounts.ts";
import { integrationsTools } from "./tool-schemas/integrations.ts";
import { agentsTools } from "./tool-schemas/agents.ts";
import { whatsappTools } from "./tool-schemas/whatsapp.ts";
import { skillsTools } from "./tool-schemas/skills.ts";
import { subagentsTools } from "./tool-schemas/subagents.ts";
import { automationProposalTools } from "./tool-schemas/automation-proposal.ts";
import { mediaTools } from "./tool-schemas/media.ts";
import { metaAdsTools } from "./tool-schemas/meta-ads.ts";
import { googleAdsTools } from "./tool-schemas/google-ads.ts";
import { adAccountConnectionsTools } from "./tool-schemas/ad-account-connections.ts";
import { campaignSchedulingTools } from "./tool-schemas/campaign-scheduling.ts";
import { broadcastsTools } from "./tool-schemas/broadcasts.ts";
import { approvalsTools } from "./tool-schemas/approvals.ts";
import { calendarTools } from "./tool-schemas/calendar.ts";
import { calendarCancellationTools } from "./tool-schemas/calendar-cancellation.ts";
import { meetingsTools } from "./tool-schemas/meetings.ts";
import { WORKSHOP_TOOLS } from "../_shared/workshop-tools.ts";

export const ALL_TOOLS = [
  ...leadCreationTools,
  ...tasksTools,
  ...agentTasksTools,
  ...taskListTools,
  ...clientsTools,
  ...messagingTools,
  ...searchTools,
  ...delegationTools,
  ...facebookInspectionTools,
  ...socialAlertsTools,
  ...campaignPulseTools,
  ...callReportingTools,
  ...clientMutationsTools,
  ...taskMutationsTools,
  ...onboardingTools,
  ...campaignersTools,
  ...salesPeopleTools,
  ...agenciesTools,
  ...suppliersTools,
  ...productsTools,
  ...automationTools,
  ...metaLeadFormsTools,
  ...reportingTools,
  ...socialTools,
  ...marketingTools,
  ...adImagesTools,
  ...memoryTools,
  ...knowledgeTools,
  ...chatTools,
  ...financeTools,
  ...accountingTools,
  ...accountingPaymentsTools,
  ...clientUpdatesTools,
  ...goalsTools,
  ...goalProgressTools,
  ...taskOwnershipTools,
  ...taskProgressTools,
  ...facebookAccountsTools,
  ...integrationsTools,
  ...agentsTools,
  ...whatsappTools,
  ...skillsTools,
  ...subagentsTools,
  ...automationProposalTools,
  ...mediaTools,
  ...metaAdsTools,
  ...googleAdsTools,
  ...adAccountConnectionsTools,
  ...campaignSchedulingTools,
  ...broadcastsTools,
  ...approvalsTools,
  ...calendarTools,
  ...calendarCancellationTools,
  ...meetingsTools,
  ...WORKSHOP_TOOLS,
];
