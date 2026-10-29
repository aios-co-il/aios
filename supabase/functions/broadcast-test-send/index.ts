// broadcast-test-send — sends one rendered email as a test, so authors can
// check it before it reaches a list.
//   { tenantId, subject, bodyHtml?, bodyText?, htmlMode?, vars?, attachments?,
//     to?: string[]   — typed addresses (max 5); default: the signed-in user
//     fromEmail?, fromName?, replyTo? — fromEmail must be on one of the tenant's domains }
import {
  type DbClient,
  serviceClient,
  userClient,
} from "../_shared/supabase-clients.ts";
import { requireAuth } from "../_shared/security.ts";
import { buildEmailContent } from "../_shared/broadcast/template/email-html.ts";
import {
  renderTemplate,
  type TemplateVars,
} from "../_shared/broadcast/template/template-vars.ts";
import {
  attachmentUrlPrefix,
  emailAttachmentsForResend,
} from "../_shared/broadcast/template/email-attachments.ts";
import { isEmailAddress } from "../_shared/broadcast/email-address.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const MAX_TEST_RECIPIENTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const auth = await requireAuth(req);
    if (auth?.kind !== "user" || !auth.userId) {
      return json({ error: "unauthorized" }, 401);
    }
    const body = await req.json();
    if (typeof body?.tenantId !== "string" || !body.tenantId) {
      return json({ error: "missing_tenant" }, 400);
    }

    const to = await resolveRecipients(body.to, auth.userId);
    if ("error" in to) return json({ error: to.error }, 400);

    const db = userClient(req.headers.get("Authorization") ?? "");
    const sender = await resolveSender(db, body.tenantId, body);
    if ("error" in sender) return json({ error: sender.error }, 400);

    const vars = isRecord(body.vars) ? body.vars : {};
    const { html, text } = buildEmailContent({
      bodyHtml: asString(body.bodyHtml),
      bodyText: asString(body.bodyText),
      htmlMode: body.htmlMode === true,
      vars,
    });
    if (!hasVisibleContent(html)) {
      return json({ error: "תוכן המייל ריק" }, 400);
    }

    const sendError = await sendViaResend({
      to: to.emails,
      subject: `[בדיקה] ${renderTemplate(asString(body.subject), vars) || "דיוור"}`,
      html,
      text,
      fromEmail: sender.email,
      fromName: sender.name,
      replyTo: asString(body.replyTo).trim() || undefined,
      attachments: emailAttachmentsForResend(
        body.attachments,
        attachmentUrlPrefix(SB_URL),
      ),
    });
    if (sendError) return json({ error: sendError }, 502);
    return json({ success: true, to: to.emails.join(", ") });
  } catch (e) {
    console.error("[broadcast-test-send]", e);
    return json({ error: "send_failed" }, 500);
  }
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

const isRecord = (v: unknown): v is TemplateVars =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Typed addresses (validated, max 5), or the signed-in user's own address. */
async function resolveRecipients(
  input: unknown,
  userId: string,
): Promise<{ emails: string[] } | { error: string }> {
  const typed = Array.isArray(input)
    ? [...new Set(input.map((e) => asString(e).trim().toLowerCase()))].filter(
        Boolean,
      )
    : [];
  if (typed.some((e) => !isEmailAddress(e))) {
    console.warn("[broadcast-test-send] rejected address", typed);
    return { error: "כתובת מייל לא תקינה" };
  }
  if (typed.length > MAX_TEST_RECIPIENTS) {
    return { error: `אפשר לשלוח בדיקה לעד ${MAX_TEST_RECIPIENTS} כתובות` };
  }
  if (typed.length > 0) return { emails: typed };

  const { data, error } = await serviceClient().auth.admin.getUserById(userId);
  if (error || !data.user?.email) {
    console.error("[broadcast-test-send] user email lookup failed", error);
    return { error: "חסרה כתובת לבדיקה" };
  }
  return { emails: [data.user.email] };
}

/**
 * Sender address: the requested one when it is on a tenant domain, else the
 * tenant's default. RLS limits the domain list to tenants the caller belongs to.
 */
async function resolveSender(
  db: DbClient,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<{ email: string; name?: string } | { error: string }> {
  const { data: domains, error } = await db
    .from("broadcast_email_domains")
    .select("domain, default_local, from_name, is_default")
    .eq("tenant_id", tenantId)
    .order("is_default", { ascending: false });
  if (error) {
    console.error("[broadcast-test-send] domains lookup failed", error);
    return { error: "send_failed" };
  }
  const fallback = domains?.[0];
  if (!fallback?.domain) {
    return { error: "לא הוגדר דומיין שליחה (דיוור → הגדרות שולח)" };
  }

  const requested = asString(body.fromEmail).trim().toLowerCase();
  if (!requested) {
    return {
      email: `${fallback.default_local || "noreply"}@${fallback.domain}`,
      name: fallback.from_name || undefined,
    };
  }
  const host = requested.split("@")[1];
  if (!isEmailAddress(requested) || !domains.some((d) => d.domain === host)) {
    console.warn("[broadcast-test-send] rejected sender", requested);
    return { error: "כתובת השולח אינה בדומיין מאומת של הארגון" };
  }
  return { email: requested, name: asString(body.fromName) || undefined };
}

/** An empty editor still renders a wrapper `<div>`; require text or an image. */
function hasVisibleContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length > 0 || /<img\b/i.test(html);
}

/** send-resend-email is internal, so it is called as the service role. Returns an error message or null. */
async function sendViaResend(
  payload: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await serviceClient().functions.invoke(
    "send-resend-email",
    { body: payload },
  );
  if (!error) return null;
  const detail = await error.context?.json?.().catch((e: unknown) => {
    console.error("[broadcast-test-send] unreadable send error", e);
    return null;
  });
  console.error("[broadcast-test-send] send failed", detail ?? error);
  return detail?.details?.message || detail?.error || "send_failed";
}
