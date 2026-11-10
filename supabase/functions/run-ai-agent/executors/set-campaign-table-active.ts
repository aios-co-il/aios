import type { SetCampaignTableActiveArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { executeClientAccessTool } from "../executors/client-access.ts";

/** Preserves the existing set_campaign_table_active executor and side-effect order. */
export async function executeSetCampaignTableActive(
  args: SetCampaignTableActiveArgs,
  context: ToolExecutionContext,
) {
  return executeClientAccessTool(
    { name: context.name, args } as Parameters<
      typeof executeClientAccessTool
    >[0],
    context,
  );
}
