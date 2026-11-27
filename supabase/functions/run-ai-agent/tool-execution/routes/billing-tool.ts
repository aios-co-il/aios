import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeGetOpenaiBillingStatus } from "../../executors/get-openai-billing-status.ts";

export const billingToolRoutes: Record<string, ToolRoute> = {
  get_openai_billing_status: bindToolRoute(executeGetOpenaiBillingStatus),
};
