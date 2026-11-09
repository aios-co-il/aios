import { type ToolRoute } from "../route.ts";
import { legacyUpdateClientStatusRoute } from "../legacy-update-client-status.ts";

/** client-records tool routes; argument assertions retain the legacy tool boundary. */
export const clientRecordsRoutes: Record<string, ToolRoute> = {
  create_client: legacyUpdateClientStatusRoute,
  update_client: legacyUpdateClientStatusRoute,
  update_client_status: legacyUpdateClientStatusRoute,
};
