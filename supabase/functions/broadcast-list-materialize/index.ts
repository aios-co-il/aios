// broadcast-list-materialize — CRM-filter mailing lists.
//
//   { mode: 'preview', tenantId, filter }  → count + sample (no writes at all)
//   { mode: 'preview', listId }            → same, using the list's filter;
//                                            a dynamic list also stores the
//                                            count as its member_count
//   { mode: 'refresh', listId }            → add the current matches to
//                                            broadcast_list_members (static or
//                                            synced list); 'freeze' is an alias
//
// Runs with the caller's JWT so RLS scopes every read and write to the
// caller's tenant.
import { userClient } from "../_shared/supabase-clients.ts";
import type { Tables } from "../_shared/database.types.ts";
import {
  type AudienceFilter,
  toAudienceFilter,
} from "../_shared/broadcast/audience/types.ts";
import { resolveAudience } from "../_shared/broadcast/audience/resolve.ts";
import { normalizePhone } from "../_shared/broadcast/template/template-vars.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    // Caller's JWT on purpose (not the service client): RLS keeps every
    // read and write inside the caller's tenant.
    const db = userClient(authHeader);

    const body = await req.json();
    const mode =
      body.mode === "refresh" || body.mode === "freeze" ? "refresh" : "preview";
    let tenantId: string | undefined = body.tenantId;
    let filter: AudienceFilter | undefined = body.filter;
    let list: Pick<
      Tables<"broadcast_lists">,
      "id" | "tenant_id" | "kind" | "source" | "source_config"
    > | null = null;

    if (body.listId) {
      const { data, error } = await db
        .from("broadcast_lists")
        .select("id, tenant_id, kind, source, source_config")
        .eq("id", body.listId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "list_not_found" }, 404);
      list = data;
      tenantId = data.tenant_id;
      filter = filter ?? toAudienceFilter(data.source_config) ?? undefined;
    }

    if (!tenantId) return json({ error: "missing_tenant" }, 400);
    if (!filter?.source || !["leads", "clients"].includes(filter.source))
      return json({ error: "filter_source_must_be_leads_or_clients" }, 400);

    const recipients = await resolveAudience(db, tenantId, filter);
    const withPhone = recipients.filter((r) => normalizePhone(r.phone)).length;
    const withEmail = recipients.filter((r) => r.email).length;
    const sample = recipients
      .slice(0, 10)
      .map((r) => ({ name: r.contact_name, phone: r.phone, email: r.email }));

    if (mode === "preview") {
      // Dynamic lists have no member rows, so the card and the wizard
      // show this last previewed count.
      if (list?.kind === "dynamic") {
        const { error } = await db
          .from("broadcast_lists")
          .update({ member_count: recipients.length })
          .eq("id", list.id);
        if (error) throw error;
      }
      return json({
        success: true,
        total: recipients.length,
        withPhone,
        withEmail,
        sample,
      });
    }

    if (!list) return json({ error: "missing_listId" }, 400);
    if (list.kind !== "static" && list.kind !== "synced")
      return json({ error: "refresh_requires_member_list" }, 400);

    const rows = recipients
      .map((r) => ({
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        name: r.contact_name,
        phone: normalizePhone(r.phone),
        email: r.email ? r.email.trim().toLowerCase() : null,
      }))
      .filter((r) => r.phone || r.email);

    let added = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await db.rpc("broadcast_list_add_members", {
        p_list_id: list.id,
        p_rows: rows.slice(i, i + 500),
        p_added_via: "crm",
      });
      if (error) throw error;
      added += Number(data || 0);
    }
    await db
      .from("broadcast_lists")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "success",
      })
      .eq("id", list.id);

    return json({
      success: true,
      total: recipients.length,
      added,
      withPhone,
      withEmail,
      sample,
    });
  } catch (e) {
    console.error("[broadcast-list-materialize]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
