// broadcast-test-send — sends one rendered email template to the signed-in
// user's own address, so authors can check it before it reaches a list.
//   { tenantId, subject, bodyHtml, vars? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildEmailContent,
  renderTemplate,
} from "../_shared/broadcast-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const db = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: auth } = await db.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const to = auth?.user?.email;
    if (!to) return json({ error: "unauthorized" }, 401);

    const { tenantId, subject, bodyHtml, htmlMode, vars } = await req.json();
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
    const res = await fetch(`${SB_URL}/functions/v1/send-resend-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SB_SERVICE}`,
        apikey: SB_SERVICE,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject: `[בדיקה] ${renderTemplate(subject || "", v) || "טמפלייט"}`,
        html,
        text,
        fromEmail: `${domain.default_local || "noreply"}@${domain.domain}`,
        fromName: domain.from_name || undefined,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: out?.error || "send_failed" }, 502);
    return json({ success: true, to });
  } catch (e) {
    console.error("[broadcast-test-send]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
