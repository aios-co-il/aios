// broadcast-enqueue — resolves a broadcast's audience_filter into a concrete
// recipient snapshot. Supports dryRun (count + sample, no writes) for the wizard,
// and commit mode (insert broadcast_recipients with per-recipient merge vars).
//
// Audience filter shape: see _shared/broadcast-audience.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type Recipient,
  filterReachable,
  resolveAudience,
} from "../_shared/broadcast-audience.ts";

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

const BAD_REQUEST = new Set([
  "missing_filter_source",
  "missing_listId",
  "missing_groupIds",
  "unknown_source",
  "list_not_found",
  "nested_list",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === SB_SERVICE;

    // User-scoped client respects RLS so a user can only enqueue their own tenant's data.
    const db = isServiceRole
      ? createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } })
      : createClient(SB_URL, SB_ANON, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        });

    const {
      broadcastId,
      dryRun,
      filter: inlineFilter,
      channel: inlineChannel,
      tenantId: inlineTenant,
    } = await req.json();

    let filter = inlineFilter;
    let channel: string = inlineChannel || "whatsapp";
    let tenantId: string | undefined = inlineTenant;

    if (broadcastId) {
      const { data: b, error } = await db
        .from("broadcasts")
        .select("id, tenant_id, channel, audience_filter, status")
        .eq("id", broadcastId)
        .single();
      if (error || !b) return json({ error: "broadcast_not_found" }, 404);
      filter = b.audience_filter || {};
      channel = b.channel;
      tenantId = b.tenant_id;
    }

    if (!filter || !filter.source)
      return json({ error: "missing_filter_source" }, 400);
    if (!tenantId) return json({ error: "missing_tenant" }, 400);

    let recipients: Recipient[];
    try {
      recipients = await resolveAudience(db, tenantId, filter);
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (BAD_REQUEST.has(msg)) return json({ error: msg }, 400);
      throw e;
    }
    const finalRecipients = await filterReachable(
      db,
      tenantId,
      channel,
      recipients,
    );

    const total = finalRecipients.length;
    const sample = finalRecipients.slice(0, 10).map((r) =>
      r.entity_type === "wa_group"
        ? { name: r.contact_name, group_chat_id: r.group_chat_id }
        : {
            name: r.contact_name,
            phone: r.phone,
            email: r.email,
            vars: r.vars,
          },
    );

    if (dryRun || !broadcastId) return json({ success: true, total, sample });

    // Commit: clear any previous snapshot for re-enqueue, then insert fresh.
    await db
      .from("broadcast_recipients")
      .delete()
      .eq("broadcast_id", broadcastId);

    const rows = finalRecipients.map((r) => ({
      broadcast_id: broadcastId,
      tenant_id: tenantId,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      // WA groups keep their chat id in phone for dispatch.
      phone: r.entity_type === "wa_group" ? r.group_chat_id : r.phone,
      email: r.email,
      contact_name: r.contact_name,
      vars: r.vars,
      status: "pending",
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db
        .from("broadcast_recipients")
        .insert(rows.slice(i, i + 500));
      if (error && !String(error.message).includes("duplicate")) throw error;
    }

    await db
      .from("broadcasts")
      .update({
        stats: { total, sent: 0, delivered: 0, failed: 0, opted_out: 0 },
      })
      .eq("id", broadcastId);

    return json({ success: true, total, sample });
  } catch (e) {
    console.error("[broadcast-enqueue]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
