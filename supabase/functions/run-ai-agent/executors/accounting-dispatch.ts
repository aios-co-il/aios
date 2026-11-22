import { executeUpdateClientRetainer } from "./update-client-retainer.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Routes all accounting aliases through their existing approval-only executor. */
export async function dispatchAccountingTool(
  name: string,
  args: Parameters<typeof executeUpdateClientRetainer>[0],
  context: ToolExecutionContext,
) {
  switch (name) {
    case "create_one_time_income":
    case "delete_one_time_income":
    case "record_income_payment":
    case "delete_income_payment":
    case "record_expense_payment":
    case "delete_expense_payment":
    case "update_client_retainer":
      return {
        result: await executeUpdateClientRetainer(args, { ...context, name }),
      };
    default:
      return null;
  }
}
