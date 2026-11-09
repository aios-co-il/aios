import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListAutomations } from "../../executors/list-automations.ts";
import { executeGetAutomationDetails } from "../../executors/get-automation-details.ts";
import { executeProposeAutomationEdit } from "../../executors/propose-automation-edit.ts";
import { executeInspectMetaLeadForms } from "../../executors/inspect-meta-lead-forms.ts";
import { executeSetAutomationMetaLeadForm } from "../../executors/set-automation-meta-lead-form.ts";
import { executeCreateMetaLeadForm } from "../../executors/create-meta-lead-form.ts";
import { executeProposeAutomation } from "../../executors/propose-automation.ts";

/** automation-tool tool routes; argument assertions retain the legacy tool boundary. */
export const automationToolRoutes: Record<string, ToolRoute> = {
  list_automations: bindToolRoute(executeListAutomations),
  get_automation_details: bindToolRoute(executeGetAutomationDetails),
  toggle_automation: bindToolRoute(executeProposeAutomationEdit),
  delete_automation: bindToolRoute(executeProposeAutomationEdit),
  propose_automation_edit: bindToolRoute(executeProposeAutomationEdit),
  inspect_meta_lead_forms: bindToolRoute(executeInspectMetaLeadForms),
  set_automation_meta_lead_form: bindToolRoute(
    executeSetAutomationMetaLeadForm,
  ),
  create_meta_lead_form: bindToolRoute(executeCreateMetaLeadForm),
  propose_automation: bindToolRoute(executeProposeAutomation),
};
