import { type ToolRoute } from "../route.ts";
import { legacyListClientsRoute } from "../legacy-list-clients.ts";

export const clientListRoutes: Record<string, ToolRoute> = {
  list_clients: legacyListClientsRoute,
};
