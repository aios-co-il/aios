import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListMarketingWorkItems } from "../../executors/list-marketing-work-items.ts";
import { executeGetMarketingWorkItem } from "../../executors/get-marketing-work-item.ts";
import { executeCreateMarketingWorkItem } from "../../executors/create-marketing-work-item.ts";
import { executeHandoffMarketingWorkItem } from "../../executors/handoff-marketing-work-item.ts";
import { executeUpdateMarketingWorkItem } from "../../executors/update-marketing-work-item.ts";
import { executeGenerateAdImage } from "../../executors/generate-ad-image.ts";

/** marketing-work tool routes; argument assertions retain the legacy tool boundary. */
export const marketingWorkRoutes: Record<string, ToolRoute> = {
  list_marketing_work_items: bindToolRoute(executeListMarketingWorkItems),
  get_marketing_work_item: bindToolRoute(executeGetMarketingWorkItem),
  create_marketing_work_item: bindToolRoute(executeCreateMarketingWorkItem),
  handoff_marketing_work_item: bindToolRoute(executeHandoffMarketingWorkItem),
  update_marketing_work_item: bindToolRoute(executeUpdateMarketingWorkItem),
  generate_ad_image: bindToolRoute(executeGenerateAdImage),
};
