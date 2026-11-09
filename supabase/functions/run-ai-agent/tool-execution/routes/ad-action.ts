import { bindToolRoute, type ToolRoute } from "../route.ts";
import { queueAdActionApproval } from "../../executors/ad-action-approval.ts";

/** ad-action tool routes; argument assertions retain the legacy tool boundary. */
export const adActionRoutes: Record<string, ToolRoute> = {
  fb_create_campaign: bindToolRoute(queueAdActionApproval),
  fb_create_adset: bindToolRoute(queueAdActionApproval),
  fb_create_ad: bindToolRoute(queueAdActionApproval),
  fb_create_creative_from_media: bindToolRoute(queueAdActionApproval),
  fb_replace_lead_form: bindToolRoute(queueAdActionApproval),
  fb_update_budget: bindToolRoute(queueAdActionApproval),
  fb_pause: bindToolRoute(queueAdActionApproval),
  fb_resume: bindToolRoute(queueAdActionApproval),
  gads_pause: bindToolRoute(queueAdActionApproval),
  gads_resume: bindToolRoute(queueAdActionApproval),
  gads_update_budget: bindToolRoute(queueAdActionApproval),
};
