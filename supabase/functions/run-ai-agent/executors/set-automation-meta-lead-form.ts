import { connectMetaFormToAutomation } from "../meta-form-binding.ts";
import { findAutomationForMetaForm } from "./meta-form-automation.ts";
import { metaLeadFormsForPage } from "./meta-lead-forms.ts";
import { metaLeadPages } from "./meta-lead-pages.ts";
import { metaNameMatches } from "./meta-lead-name-match.ts";
import type { SetAutomationMetaLeadFormArgs } from "./automation-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing set_automation_meta_lead_form executor and side-effect order. */
export async function executeSetAutomationMetaLeadForm(
  args: SetAutomationMetaLeadFormArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, canManageAutomations } = context;

  if (!args.confirmed) {
    throw new Error("נדרש אישור מפורש לפני החלפת טופס באוטומציה");
  }
  if (!canManageAutomations) {
    throw new Error(
      "רק מנהל צוות, בעלים או Super Admin רשאים לשנות טופס באוטומציה",
    );
  }
  const automation = await findAutomationForMetaForm(
    supabase,
    accessibleTenantIds,
    args.automation_id,
    args.automation_name,
  );
  let pages = await metaLeadPages(supabase, automation.tenant_id);
  if (args.page_name) {
    pages = pages.filter((p) => metaNameMatches(p.name, args.page_name));
  }
  const forms = (
    await Promise.all(pages.map((page) => metaLeadFormsForPage(page)))
  )
    .flat()
    .filter((form) => metaNameMatches(form.name, args.form_name));
  if (forms.length === 0) {
    throw new Error(`לא נמצא ב-Meta טופס בשם "${args.form_name}"`);
  }
  if (forms.length > 1) {
    throw new Error(
      `נמצאו כמה טפסים תואמים: ${forms.map((f) => `${f.name} — ${f.page_name} (${f.id})`).join(", ")}. יש לציין גם את שם העמוד`,
    );
  }
  const form = forms[0];
  const connected = await connectMetaFormToAutomation(
    supabase,
    automation,
    form,
  );
  return { success: true, ...connected, form, sync_registered: true };
}
