import type { ToolExecutionContext } from "../tool-context.ts";
import { executeClientAccessTool } from "../executors/client-access.ts";

type SetCampaignTableActiveArgs = {
  client_id?: string;
  table_id?: string;
  table_name?: string;
  active: boolean;
};

export async function executeSetCampaignTableActive(
  args: SetCampaignTableActiveArgs & {
    all_scopes?: boolean;
    content?: unknown;
    update_type?: unknown;
  },
  context: ToolExecutionContext,
) {
  if (context.name === "get_client_info") {
    if (!args.client_id) {
      throw new Error("client_id required");
    }
    return executeClientAccessTool(
      { name: context.name, args: { ...args, client_id: args.client_id } },
      context,
    );
  }
  if (context.name === "add_client_update") {
    if (!args.client_id) {
      throw new Error("client_id required");
    }
    return executeClientAccessTool(
      { name: context.name, args: { ...args, client_id: args.client_id } },
      context,
    );
  }
  return executeClientAccessTool(
    { name: "set_campaign_table_active", args },
    context,
  );
}
