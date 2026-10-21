// broadcast-test-send — sends one rendered email template to the signed-in
// user's own address, so authors can check it before it reaches a list.
//   { tenantId, subject, bodyHtml, vars? }
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import {
  buildEmailContent,
  renderTemplate,
  attachmentUrlPrefix,
  emailAttachmentsForResend,
} from "../_shared/broadcast-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const db = userClient(authHeader);
    const { data: auth } = await db.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const to = auth?.user?.email;
    if (!to) return json({ error: "unauthorized" }, 401);

    const { tenantId, subject, bodyHtml, htmlMode, vars, attachments } =
      await req.json();
    if (!tenantId) return json({ error: "missing_tenant" }, 400);

    // RLS: only domains of a tenant the user can see.
    const { data: domain } = await db
      .from("broadcast_email_domains")
      .select("domain, default_local, from_name")
      .eq("tenant_id", tenantId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!domain?.domain)
      return json(
        { error: "לא הוגדר דומיין שליחה (דיוור → הגדרות שולח)" },
        400,
      );

    const v = vars && typeof vars === "object" ? vars : {};
    const { html, text } = buildEmailContent({
      bodyHtml: bodyHtml || "",
      htmlMode: !!htmlMode,
      vars: v,
    });
    // send-resend-email is internal; call it as the service role.
    const { error: sendError } = await serviceClient().functions.invoke(
      "send-resend-email",
      {
        body: {
          to,
          subject: `[בדיקה] ${renderTemplate(subject || "", v) || "טמפלייט"}`,
          html,
          text,
          fromEmail: `${domain.default_local || "noreply"}@${domain.domain}`,
          fromName: domain.from_name || undefined,
          attachments: emailAttachmentsForResend(
            attachments,
            attachmentUrlPrefix(SB_URL),
          ),
        },
      },
    );
    if (sendError) {
      const detail = await sendError.context?.json?.().catch(() => null);
      return json({ error: detail?.error || "send_failed" }, 502);
    }
    return json({ success: true, to });
  } catch (e) {
    console.error("[broadcast-test-send]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
