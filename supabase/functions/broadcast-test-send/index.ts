// broadcast-test-send — sends one rendered email as a test, so authors can
// check it before it reaches a list.
//   { tenantId, subject, bodyHtml?, bodyText?, htmlMode?, vars?, attachments?,
//     to?: string | string[]   — typed addresses (max 5); default: the signed-in user
//     fromEmail?, fromName?, replyTo? — fromEmail must be on one of the tenant's domains }
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { buildEmailContent } from "../_shared/broadcast/template/email-html.ts";
import { renderTemplate } from "../_shared/broadcast/template/template-vars.ts";
import {
  attachmentUrlPrefix,
  emailAttachmentsForResend,
} from "../_shared/broadcast/template/email-attachments.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const MAX_TEST_RECIPIENTS = 5;
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

/** Typed test addresses: trimmed, lowercased, deduped. Null when any is invalid. */
function parseTestRecipients(input: unknown): string[] | null {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\s,;]+/)
      : [];
  const emails = [
    ...new Set(
      raw
        .map((e) => String(e ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return emails.every((e) => EMAIL_RE.test(e)) ? emails : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const db = userClient(authHeader);
    const { data: auth } = await db.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userEmail = auth?.user?.email;
    if (!auth?.user) return json({ error: "unauthorized" }, 401);

    const {
      tenantId,
      subject,
      bodyHtml,
      bodyText,
      htmlMode,
      vars,
      attachments,
      to: toInput,
      fromEmail,
      fromName,
      replyTo,
    } = await req.json();
    if (!tenantId) return json({ error: "missing_tenant" }, 400);

    const typed = parseTestRecipients(toInput);
    if (typed === null) return json({ error: "כתובת מייל לא תקינה" }, 400);
    if (typed.length > MAX_TEST_RECIPIENTS)
      return json(
        { error: `אפשר לשלוח בדיקה לעד ${MAX_TEST_RECIPIENTS} כתובות` },
        400,
      );
    const to = typed.length > 0 ? typed : userEmail ? [userEmail] : [];
    if (to.length === 0) return json({ error: "חסרה כתובת לבדיקה" }, 400);

    // RLS: only domains of a tenant the user can see.
    const { data: domains } = await db
      .from("broadcast_email_domains")
      .select("domain, default_local, from_name, is_default")
      .eq("tenant_id", tenantId)
      .order("is_default", { ascending: false });
    const domain = domains?.[0];
    if (!domain?.domain)
      return json(
        { error: "לא הוגדר דומיין שליחה (דיוור → הגדרות שולח)" },
        400,
      );

    let from = `${domain.default_local || "noreply"}@${domain.domain}`;
    let senderName: string | undefined = domain.from_name || undefined;
    if (fromEmail) {
      const requested = String(fromEmail).trim().toLowerCase();
      const host = requested.split("@")[1];
      if (!EMAIL_RE.test(requested) || !domains!.some((d) => d.domain === host))
        return json({ error: "כתובת השולח אינה בדומיין מאומת של הארגון" }, 400);
      from = requested;
      senderName = fromName ? String(fromName) : undefined;
    }

    const v = vars && typeof vars === "object" ? vars : {};
    const { html, text } = buildEmailContent({
      bodyHtml: bodyHtml || "",
      bodyText: bodyText || "",
      htmlMode: !!htmlMode,
      vars: v,
    });
    if (!html.replace(/<[^>]*>/g, "").trim() && !/<img\b/i.test(html))
      return json({ error: "תוכן המייל ריק" }, 400);

    // send-resend-email is internal; call it as the service role.
    const { error: sendError } = await serviceClient().functions.invoke(
      "send-resend-email",
      {
        body: {
          to,
          subject: `[בדיקה] ${renderTemplate(subject || "", v) || "דיוור"}`,
          html,
          text,
          fromEmail: from,
          fromName: senderName,
          replyTo: replyTo ? String(replyTo).trim() : undefined,
          attachments: emailAttachmentsForResend(
            attachments,
            attachmentUrlPrefix(SB_URL),
          ),
        },
      },
    );
    if (sendError) {
      const detail = await sendError.context?.json?.().catch(() => null);
      const resendMsg = detail?.details?.message;
      return json({ error: resendMsg || detail?.error || "send_failed" }, 502);
    }
    return json({ success: true, to: to.join(", ") });
  } catch (e) {
    console.error("[broadcast-test-send]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
