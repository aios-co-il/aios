import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeGetOpenaiBillingStatus } from "../../executors/get-openai-billing-status.ts";

/** billing-tool tool routes; argument assertions retain the legacy tool boundary. */
export const billingToolRoutes: Record<string, ToolRoute> = {
  get_openai_billing_status: bindToolRoute(executeGetOpenaiBillingStatus),
};
