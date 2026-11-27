import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeUpdateClientRetainer } from "../../executors/update-client-retainer.ts";

export const accountingApprovalRoutes: Record<string, ToolRoute> = {
  create_one_time_income: bindToolRoute(executeUpdateClientRetainer),
  delete_one_time_income: bindToolRoute(executeUpdateClientRetainer),
  record_income_payment: bindToolRoute(executeUpdateClientRetainer),
  delete_income_payment: bindToolRoute(executeUpdateClientRetainer),
  record_expense_payment: bindToolRoute(executeUpdateClientRetainer),
  delete_expense_payment: bindToolRoute(executeUpdateClientRetainer),
  update_client_retainer: bindToolRoute(executeUpdateClientRetainer),
};
