import { type ToolRoute } from "../route.ts";
import { legacyDeleteLeadRoute } from "../legacy-delete-lead.ts";

/** lead-tools tool routes; argument assertions retain the legacy tool boundary. */
export const leadToolsRoutes: Record<string, ToolRoute> = {
  create_lead: legacyDeleteLeadRoute,
  list_leads: legacyDeleteLeadRoute,
  update_lead_status: legacyDeleteLeadRoute,
  add_lead_update: legacyDeleteLeadRoute,
  update_lead: legacyDeleteLeadRoute,
  delete_lead: legacyDeleteLeadRoute,
};
