/** How risky running an approval row is; it decides who may approve the row. */
export type RiskClass =
  | "money"
  | "external_send"
  | "notify_staff"
  | "config"
  | "destructive"
  | "internal_write"
  | "unknown";

/** Classes only an approver role may approve. Unknown tools are treated as approver-only. */
export const APPROVER_ONLY_RISK_CLASSES: readonly RiskClass[] = Object.freeze([
  "money",
  "external_send",
  "config",
  "destructive",
  "unknown",
]);

/** Risk class of a row's tool_name (direct-tool rows use the called tool's name). */
export function approvalRiskClass(
  row: { tool_name?: string | null } | null | undefined,
): RiskClass {
  const tool = String(row?.tool_name || "");
  return APPROVAL_RISK_BY_TOOL[tool] || "unknown";
}

const APPROVAL_RISK_BY_TOOL: Readonly<Record<string, RiskClass>> =
  Object.freeze({
    // Ad spend and delivery (Meta / Google)
    fb_create_campaign: "money",
    fb_create_adset: "money",
    fb_create_ad: "money",
    fb_update_budget: "money",
    fb_pause: "money",
    fb_resume: "money",
    fb_duplicate_ad_variants: "money",
    duplicate_facebook_ad_variants: "money",
    toggle_facebook_campaign: "money",
    update_facebook_budget: "money",
    duplicate_facebook_campaign: "money",
    gads_pause: "money",
    gads_resume: "money",
    gads_update_budget: "money",
    schedule_campaign_toggle: "money",
    // Accounting
    create_one_time_income: "money",
    delete_one_time_income: "money",
    record_income_payment: "money",
    delete_income_payment: "money",
    record_expense_payment: "money",
    delete_expense_payment: "money",
    update_client_retainer: "money",
    create_finance_entry: "money",
    // Messages that leave the agency
    send_broadcast_now: "external_send",
    schedule_broadcast: "external_send",
    send_message: "external_send",
    send_whatsapp_via_gateway: "external_send",
    publish_social_post: "external_send",
    reply_to_social_comment: "external_send",
    hide_social_comment: "external_send",
    send_calendar_invite: "external_send",
    update_calendar_invite: "external_send",
    cancel_calendar_invite: "external_send",
    join_meeting_for_client: "external_send",
    // Messages to staff
    send_whatsapp_to_staff: "notify_staff",
    send_message_to_campaigner: "notify_staff",
    // Configuration, access and agent behavior
    fb_create_creative_from_media: "config",
    fb_replace_lead_form: "config",
    create_automation: "config",
    edit_automation: "config",
    toggle_automation: "config",
    delete_automation: "config",
    toggle_integration: "config",
    create_agent: "config",
    update_agent: "config",
    create_skill: "config",
    update_skill: "config",
    create_campaigner: "config",
    create_sales_person: "config",
    create_agency: "config",
    connect_google_ads_account: "config",
    connect_client_meta_ad_account: "config",
    create_meta_lead_form: "config",
    set_automation_meta_lead_form: "config",
    set_campaign_table_active: "config",
    create_whatsapp_instance: "config",
    // Deletions
    delete_lead: "destructive",
    delete_task: "destructive",
    delete_memory: "destructive",
    // Internal, reversible
    cancel_broadcast: "internal_write",
  });
