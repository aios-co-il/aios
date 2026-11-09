import { type ToolRoute } from "../route.ts";
import { legacyListClientsRoute } from "../legacy-list-clients.ts";

/** client-list tool routes; argument assertions retain the legacy tool boundary. */
export const clientListRoutes: Record<string, ToolRoute> = {
  list_clients: legacyListClientsRoute,
};
