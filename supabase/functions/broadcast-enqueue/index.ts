// broadcast-enqueue — resolves a broadcast's audience_filter into a concrete
// recipient snapshot. Supports dryRun (count + sample, no writes) for the wizard,
// and commit mode (insert broadcast_recipients with per-recipient merge vars).
//
// Audience filter shape: see _shared/broadcast/audience/resolve.ts.
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { writeEnqueueStats } from "./stats.ts";
import { isServiceKey } from "../_shared/timing-safe-equal.ts";
import type { Recipient } from "../_shared/broadcast/audience/types.ts";
import { filterReachable } from "../_shared/broadcast/audience/reachability.ts";
import { resolveAudience } from "../_shared/broadcast/audience/resolve.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

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
    const isServiceRole = isServiceKey(token, SB_SERVICE);

    // User-scoped client respects RLS so a user can only enqueue their own tenant's data.
    const db = isServiceRole ? serviceClient() : userClient(authHeader);

    const {
      broadcastId,
      dryRun,
      claimRevision,
      filter: inlineFilter,
      channel: inlineChannel,
      tenantId: inlineTenant,
    } = await req.json();

    let filter = inlineFilter;
    let channel: string = inlineChannel || "whatsapp";
    let tenantId: string | undefined = inlineTenant;

    if (
      claimRevision !== undefined &&
      (!isServiceRole ||
        typeof claimRevision !== "string" ||
        !claimRevision ||
        !broadcastId)
    ) {
      return json({ error: "invalid_claim" }, 403);
    }
    if (broadcastId) {
      let query = db
        .from("broadcasts")
        .select("id, tenant_id, channel, audience_filter, status")
        .eq("id", broadcastId);
      if (claimRevision) {
        query = query.eq("status", "paused").eq("updated_at", claimRevision);
      }
      const { data: b, error } = await query.single();
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

    const revision = await writeEnqueueStats(
      db,
      tenantId,
      broadcastId,
      total,
      claimRevision,
    );
    return json({ success: true, total, sample, revision });
  } catch (e) {
    console.error("[broadcast-enqueue]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
