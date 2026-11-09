import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeCreateOnboarding } from "../../executors/create-onboarding.ts";
import { executeListOnboarding } from "../../executors/list-onboarding.ts";
import { executeUpdateOnboardingStatus } from "../../executors/update-onboarding-status.ts";

/** onboarding tool routes; argument assertions retain the legacy tool boundary. */
export const onboardingRoutes: Record<string, ToolRoute> = {
  create_onboarding: bindToolRoute(executeCreateOnboarding),
  list_onboarding: bindToolRoute(executeListOnboarding),
  update_onboarding_status: bindToolRoute(executeUpdateOnboardingStatus),
};
