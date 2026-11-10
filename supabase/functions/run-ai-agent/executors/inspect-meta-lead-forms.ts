import { metaLeadFormsForPage } from "./meta-lead-forms.ts";
import { metaLeadPages } from "./meta-lead-pages.ts";
import { metaNameMatches } from "./meta-lead-name-match.ts";
import type { InspectMetaLeadFormsArgs } from "./automation-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentRow } from "../database-contracts.ts";
import { readAutomationStepSummary } from "../tool-storage-contracts.ts";

/** Preserves the existing inspect_meta_lead_forms executor and side-effect order. */
export async function executeInspectMetaLeadForms(
  args: InspectMetaLeadFormsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds } = context;

  const { data: automations, error: automationError } = await supabase
    .from("automations")
    .select("id, name, active, tenant_id")
    .in("tenant_id", accessibleTenantIds)
    .eq("is_flow", true)
    .order("name");
  if (automationError) {
    throw automationError;
  }
  let matchingAutomations: Array<
    Pick<AgentRow<"automations">, "id" | "name" | "active" | "tenant_id">
  > = automations || [];
  if (args.automation_name) {
    matchingAutomations = matchingAutomations.filter((a) =>
      metaNameMatches(a.name, args.automation_name),
    );
  }
  const automationIds = matchingAutomations.map((a) => a.id);
  const { data: triggerSteps, error: triggerError } = automationIds.length
    ? await supabase
        .from("automation_flow_steps")
        .select("automation_id, configuration")
        .in("automation_id", automationIds)
        .eq("step_type", "trigger")
    : { data: [], error: null };
  if (triggerError) {
    throw triggerError;
  }
  const triggerRows: Array<
    Pick<AgentRow<"automation_flow_steps">, "automation_id" | "configuration">
  > = triggerSteps || [];
  const currentByAutomation = new Map(
    triggerRows
      .map(
        (s) =>
          [
            s.automation_id,
            readAutomationStepSummary(s.configuration),
          ] as const,
      )
      .filter(([, configuration]) => configuration.facebook_form_id),
  );

  let pages = await metaLeadPages(supabase, tenantId);
  if (args.page_name) {
    pages = pages.filter((p) => metaNameMatches(p.name, args.page_name));
  }
  const formsNested = await Promise.all(
    pages.map((page) => metaLeadFormsForPage(page)),
  );
  let forms = formsNested.flat();
  if (args.form_name) {
    forms = forms.filter((f) => metaNameMatches(f.name, args.form_name));
  }
  return {
    automations: matchingAutomations.map((automation) => {
      const current = currentByAutomation.get(automation.id);
      return {
        id: automation.id,
        name: automation.name,
        active: automation.active,
        connected_form: current
          ? {
              id: current.facebook_form_id,
              name: current.facebook_form_name || null,
              page_id: current.facebook_page_id || null,
              page_name: current.facebook_page_name || null,
              integration_id: current.facebook_integration_id || null,
            }
          : null,
      };
    }),
    pages: pages.map(({ access_token, ...page }) => {
      void access_token;
      return page;
    }),
    forms,
    count: forms.length,
    live_from_meta: true,
  };
}
