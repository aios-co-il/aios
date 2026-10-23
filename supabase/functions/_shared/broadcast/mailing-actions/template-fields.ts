// Template loading and the broadcast columns copied from it.
import type { DbClient } from "../../supabase-clients.ts";
import type { Tables, TablesInsert } from "../../database.types.ts";
import { templateContent } from "../template/template-content.ts";
import { idParam, type MailingActionContext, str } from "./types.ts";

export type Template = Tables<"message_templates">;
/** Broadcast columns shared by every automation send; callers add `name`. */
export type BroadcastFields = Omit<TablesInsert<"broadcasts">, "name">;

export async function loadTemplate(
  db: DbClient,
  tenantId: string,
  templateId: unknown,
): Promise<Template> {
  const id = idParam(templateId);
  if (!id) throw new Error("לא נבחר טמפלייט");
  const { data, error } = await db
    .from("message_templates")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("הטמפלייט לא נמצא");
  return data;
}

/** Broadcast columns for a template + channel sender. */
export async function broadcastFieldsFromTemplate(
  db: DbClient,
  tenantId: string,
  template: Template,
  config: Record<string, unknown>,
  ctx: MailingActionContext,
): Promise<BroadcastFields> {
  const content = templateContent(template);
  const common: Omit<BroadcastFields, "provider"> = {
    tenant_id: tenantId,
    channel: template.channel,
    template_id: template.id,
    subject: template.subject,
    body_text: content.bodyText,
    body_html: content.channel === "email" ? content.bodyHtml : null,
    html_mode: content.channel === "email" && content.htmlMode,
    attachments: content.channel === "email" ? content.attachments : [],
    media_url: content.channel === "whatsapp" ? content.mediaUrl : null,
    origin: "automation",
    automation_id: ctx.automationId,
  };
  if (content.channel === "email") {
    const from = await ctx.resolveEmailFrom(db, config, tenantId);
    return {
      ...common,
      provider: "resend",
      integration_id: null,
      from_email: from.fromEmail,
      from_name: from.fromName,
      reply_to: str(config.reply_to),
      created_by: await ctx.resolveOwnerId(db, tenantId),
    };
  }
  const integrationId = idParam(config.integration_id);
  const q = db
    .from("tenant_integrations")
    .select("id, user_id, integration_type")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("integration_type", ["green_api", "manus_wa"]);
  // An id filter matches at most one row, so limit(1) only matters without it.
  const { data: integ } = await (integrationId ? q.eq("id", integrationId) : q)
    .limit(1)
    .maybeSingle();
  if (!integ) throw new Error("לא נמצא חיבור WhatsApp פעיל לשליחה");
  return {
    ...common,
    provider: integ.integration_type === "manus_wa" ? "manus_wa" : "green_api",
    integration_id: integ.id,
    created_by: integ.user_id || (await ctx.resolveOwnerId(db, tenantId)),
  };
}
