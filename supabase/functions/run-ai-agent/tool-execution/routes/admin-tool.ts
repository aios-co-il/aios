import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeQuerySystemGraph } from "../../executors/query-system-graph.ts";
import { executeSetCampaignTableActive } from "../../executors/set-campaign-table-active.ts";
import { executeSearchEntities } from "../../executors/search-entities.ts";
import { executeListIntegrations } from "../../executors/list-integrations.ts";
import { executeToggleIntegration } from "../../executors/toggle-integration.ts";
import { executeListAgents } from "../../executors/list-agents.ts";
import { executeCreateAgent } from "../../executors/create-agent.ts";
import { executeUpdateAgent } from "../../executors/update-agent.ts";
import { executeCreateWhatsappInstance } from "../../executors/create-whatsapp-instance.ts";
import { executeGetWhatsappQrLink } from "../../executors/get-whatsapp-qr-link.ts";
import { executeGetWhatsappStatus } from "../../executors/get-whatsapp-status.ts";
import { executeSendWhatsappViaGateway } from "../../executors/send-whatsapp-via-gateway.ts";

/** admin-tool tool routes; argument assertions retain the legacy tool boundary. */
export const adminToolRoutes: Record<string, ToolRoute> = {
  query_system_graph: bindToolRoute(executeQuerySystemGraph),
  get_client_info: bindToolRoute(executeSetCampaignTableActive),
  add_client_update: bindToolRoute(executeSetCampaignTableActive),
  set_campaign_table_active: bindToolRoute(executeSetCampaignTableActive),
  search_entities: bindToolRoute(executeSearchEntities),
  list_integrations: bindToolRoute(executeListIntegrations),
  toggle_integration: bindToolRoute(executeToggleIntegration),
  list_agents: bindToolRoute(executeListAgents),
  create_agent: bindToolRoute(executeCreateAgent),
  update_agent: bindToolRoute(executeUpdateAgent),
  create_whatsapp_instance: bindToolRoute(executeCreateWhatsappInstance),
  get_whatsapp_qr_link: bindToolRoute(executeGetWhatsappQrLink),
  get_whatsapp_status: bindToolRoute(executeGetWhatsappStatus),
  send_whatsapp_via_gateway: bindToolRoute(executeSendWhatsappViaGateway),
};
