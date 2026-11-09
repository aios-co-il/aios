import type { AgentDatabaseClient, AgentRow } from "./database-contracts.ts";
import { readLeadTriggerConfiguration } from "./lead-trigger-configuration.ts";
import { readMetaLeadSettings } from "./meta-lead-settings.ts";

export type MetaLeadForm = {
  id: string;
  name: string;
  status: string | null;
  fields: Array<{ key: string; label: string; type: string }>;
  page_id: string;
  page_name: string;
  integration_id: string;
};

/** Validate both settings documents before updating a trigger and its Meta form mapping. */
export async function connectMetaFormToAutomation(
  supabase: AgentDatabaseClient,
  automation: Pick<AgentRow<"automations">, "id" | "name" | "active"> & {
    tenant_id: string;
  },
  form: MetaLeadForm,
) {
  const { data: steps, error: stepsError } = await supabase
    .from("automation_flow_steps")
    .select("id, action_type, configuration")
    .eq("automation_id", automation.id)
    .eq("tenant_id", automation.tenant_id)
    .eq("step_type", "trigger");
  if (stepsError) {
    throw stepsError;
  }
  const candidates = (steps || [])
    .filter((step) => step.action_type === "lead_created")
    .map((step) => ({
      ...step,
      originalConfiguration: step.configuration,
      configuration: readLeadTriggerConfiguration(step.configuration),
    }))
    .filter(
      (step) =>
        !step.configuration.lead_source ||
        ["any", "facebook_form"].includes(step.configuration.lead_source),
    );
  if (candidates.length !== 1) {
    throw new Error(
      candidates.length === 0
        ? "לא נמצא באוטומציה טריגר יחיד מסוג ליד חדש שניתן לחבר לטופס Meta"
        : "נמצאו כמה טריגרים מתאימים באוטומציה; יש לתקן את הזרימה לפני החלפת הטופס",
    );
  }
  const step = candidates[0];
  const configuration = {
    ...step.configuration,
    lead_source: "facebook_form",
    facebook_integration_id: form.integration_id,
    facebook_page_id: form.page_id,
    facebook_page_name: form.page_name,
    facebook_form_id: form.id,
    facebook_form_name: form.name,
    facebook_form_fields: form.fields,
  };
  const { data: integration, error: integrationError } = await supabase
    .from("tenant_integrations")
    .select("settings")
    .eq("id", form.integration_id)
    .eq("tenant_id", automation.tenant_id)
    .maybeSingle();
  if (integrationError) {
    throw integrationError;
  }
  if (!integration) {
    throw new Error("אינטגרציית Meta של הטופס אינה שייכת לארגון האוטומציה");
  }
  const settings = readMetaLeadSettings(integration.settings);
  const formMappings = { ...settings.form_mappings };
  formMappings[form.id] = {
    ...formMappings[form.id],
    form_name: form.name,
    page_id: form.page_id,
    page_name: form.page_name,
    agency_id: formMappings[form.id]?.agency_id || null,
    sales_person_ids: formMappings[form.id]?.sales_person_ids || [],
  };
  const { error: updateError } = await supabase
    .from("automation_flow_steps")
    .update({ configuration })
    .eq("id", step.id)
    .eq("tenant_id", automation.tenant_id);
  if (updateError) {
    throw updateError;
  }

  const { error: mappingError } = await supabase
    .from("tenant_integrations")
    .update({ settings: { ...settings, form_mappings: formMappings } })
    .eq("id", form.integration_id)
    .eq("tenant_id", automation.tenant_id);
  if (mappingError) {
    const { error: rollbackError } = await supabase
      .from("automation_flow_steps")
      .update({ configuration: step.originalConfiguration })
      .eq("id", step.id)
      .eq("tenant_id", automation.tenant_id);
    if (rollbackError) {
      console.error("[Meta form binding] trigger rollback failed", {
        automationId: automation.id,
        stepId: step.id,
      });
      throw new AggregateError(
        [mappingError, rollbackError],
        "Meta mapping update and trigger rollback failed",
      );
    }
    throw mappingError;
  }
  return {
    automation_id: automation.id,
    automation_name: automation.name,
    trigger_step_id: step.id,
  };
}
