import { normalizeMetaLeadQuestions } from "./meta-lead-questions.ts";
import type { MetaLeadForm } from "./meta-lead-types.ts";
import { connectMetaFormToAutomation } from "../meta-form-binding.ts";
import { findAutomationForMetaForm } from "./meta-form-automation.ts";
import { metaLeadFormsForPage } from "./meta-lead-forms.ts";
import { metaLeadPages } from "./meta-lead-pages.ts";
import { assertHttpsUrl } from "./https-url.ts";
import { metaNameMatches } from "./meta-lead-name-match.ts";
import type { CreateMetaLeadFormArgs } from "./automation-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

import { FB_GRAPH_VERSION } from "../executors/meta-api-version.ts";

/** Preserves the existing create_meta_lead_form executor and side-effect order. */
export async function executeCreateMetaLeadForm(
  args: CreateMetaLeadFormArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds, canManageAutomations } =
    context;

  if (!args.confirmed) {
    throw new Error("נדרש אישור מפורש לפני יצירת טופס חדש ב-Meta");
  }
  if (!canManageAutomations) {
    throw new Error("רק מנהל צוות, בעלים או Super Admin רשאים ליצור טופס Meta");
  }
  const normalizedQuestions = normalizeMetaLeadQuestions(args.questions);
  const privacyUrl = assertHttpsUrl(
    args.privacy_policy_url,
    "privacy_policy_url",
  );
  const followUpUrl = assertHttpsUrl(
    args.follow_up_action_url,
    "follow_up_action_url",
  );
  const pages = (await metaLeadPages(supabase, tenantId)).filter((page) =>
    metaNameMatches(page.name, args.page_name),
  );
  if (pages.length === 0) {
    throw new Error(`לא נמצא עמוד Meta בשם "${args.page_name}"`);
  }
  if (pages.length > 1) {
    throw new Error(
      `נמצאו כמה עמודים תואמים: ${pages.map((p) => `${p.name} (${p.id})`).join(", ")}. יש לציין שם מדויק יותר`,
    );
  }
  const page = pages[0];
  const existingForms = await metaLeadFormsForPage(page);
  if (
    existingForms.some(
      (form) =>
        form.name.trim().toLocaleLowerCase() ===
        String(args.form_name).trim().toLocaleLowerCase(),
    )
  ) {
    throw new Error(
      `כבר קיים בעמוד "${page.name}" טופס בשם "${args.form_name}". השתמשי בכלי ההחלפה או בחרי שם חדש`,
    );
  }
  const body = new URLSearchParams({
    access_token: page.access_token,
    name: String(args.form_name).trim(),
    questions: JSON.stringify(normalizedQuestions),
    privacy_policy: JSON.stringify({
      url: privacyUrl,
      link_text: String(args.privacy_policy_link_text || "מדיניות פרטיות"),
    }),
    follow_up_action_url: followUpUrl,
  });
  const response = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${page.id}/leadgen_forms`,
    { method: "POST", body },
  );
  const json = await response.json();
  if (!response.ok || json?.error || !json?.id) {
    throw new Error(json?.error?.message || "Meta לא אפשרה ליצור את הטופס");
  }
  const createdForm: MetaLeadForm = {
    id: String(json.id),
    name: String(args.form_name).trim(),
    status: "DRAFT",
    fields: normalizedQuestions.map((question, index) => ({
      key:
        question.type === "CUSTOM"
          ? `custom_${index + 1}`
          : question.type.toLocaleLowerCase(),
      label: question.label || question.type,
      type: question.type,
    })),
    page_id: page.id,
    page_name: page.name,
    integration_id: page.integration_id,
  };
  let connected: Awaited<
    ReturnType<typeof connectMetaFormToAutomation>
  > | null = null;
  if (args.automation_id || args.automation_name) {
    const automation = await findAutomationForMetaForm(
      supabase,
      accessibleTenantIds,
      args.automation_id,
      args.automation_name,
    );
    connected = await connectMetaFormToAutomation(
      supabase,
      automation,
      createdForm,
    );
  }
  return {
    success: true,
    form: createdForm,
    connected_automation: connected,
    note: connected
      ? "הטופס נוצר וחובר לאוטומציה. יש לפרסם/להפעיל אותו ב-Meta אם נוצר כטיוטה."
      : "הטופס נוצר. יש לפרסם/להפעיל אותו ב-Meta ולחבר אותו לאוטומציה לפי הצורך.",
  };
}
