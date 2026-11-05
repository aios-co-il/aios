// Posts Carmen's introduction in already-allowed Manus groups and sends a
// private code to phones already marked for groups. The code is stored on
// wa_pending_activations (group_chat_id set) and typed back in that group.
// Does not create another allowlist and does not call carmen_send_activation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  attachGroupAffiliations,
  eligibleManusGroups,
  generateVerificationCode,
  groupsReadyToIntroduce,
  introMessage,
  privateCodeMessage,
  selectRoundGroups,
  selectRoundPhones,
} from "../_shared/carmen-group-verification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MANAGER_ROLES = new Set([
  "super_admin",
  "owner",
  "agency_owner",
  "team_manager",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token);
  if (userError || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const tenantId = String(body.tenantId || "");
  const agentId = String(body.agentId || "");
  if (!tenantId || !agentId)
    return json({ error: "missing tenant or agent" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", user.id);
  if (rolesError) return json({ error: "role check failed" }, 500);
  const allowed = (roles || []).some(
    (role) =>
      (role.role === "super_admin" && role.tenant_id == null) ||
      (role.tenant_id === tenantId && MANAGER_ROLES.has(role.role)),
  );
  if (!allowed) return json({ error: "forbidden" }, 403);

  const { data: policy, error: policyError } = await admin
    .from("carmen_access_policies")
    .select("private_phones, allowed_group_ids, open_member_groups")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (policyError) return json({ error: policyError.message }, 500);

  const phones = selectRoundPhones(policy?.private_phones);
  const { data: integrations, error: integError } = await admin
    .from("tenant_integrations")
    .select("id, user_id, settings, updated_at")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "manus_wa")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (integError) return json({ error: integError.message }, 500);
  const integ = integrations?.[0];
  if (!integ?.user_id)
    return json({ error: "no active manus connection" }, 404);

  const catalog = (integrations || []).flatMap((row) => {
    const groups = row.settings?.manus_groups_sync?.groups;
    return Array.isArray(groups) ? groups : [];
  });
  const chatIds = [
    ...new Set(
      catalog
        .map((entry) => String(entry?.groupChatId || "").trim())
        .filter(Boolean),
    ),
  ];
  const { data: tagged, error: taggedError } = await admin
    .from("whatsapp_groups")
    .select("id, group_name, group_chat_id, description, is_blocked")
    .eq("tenant_id", tenantId)
    .eq("description", "manus_wa_sync");
  if (taggedError) return json({ error: taggedError.message }, 500);
  let catalogRows: Array<Record<string, unknown>> = [];
  if (chatIds.length > 0) {
    const { data, error } = await admin
      .from("whatsapp_groups")
      .select("id, group_name, group_chat_id, description, is_blocked")
      .eq("tenant_id", tenantId)
      .in("group_chat_id", chatIds);
    if (error) return json({ error: error.message }, 500);
    catalogRows = data || [];
  }
  const dbRows = [...(tagged || []), ...catalogRows].filter(
    (row) => row.is_blocked !== true,
  );
  const selected = selectRoundGroups(eligibleManusGroups({ catalog, dbRows }), {
    allowedGroupIds: policy?.allowed_group_ids,
    openMemberGroups: policy?.open_member_groups === true,
  });
  if (selected.length === 0 || phones.length === 0) {
    return json({ ok: true, groups: 0, codes: 0, reason: "nothing_selected" });
  }

  const linkQuery = await admin
    .from("carmen_client_group_access")
    .select("whatsapp_group_id, client_id, agency_id")
    .eq("tenant_id", tenantId);
  let links = linkQuery.data || [];
  if (linkQuery.error && /agency_id/.test(linkQuery.error.message || "")) {
    const fallback = await admin
      .from("carmen_client_group_access")
      .select("whatsapp_group_id, client_id")
      .eq("tenant_id", tenantId);
    if (fallback.error) return json({ error: fallback.error.message }, 500);
    links = fallback.data || [];
  } else if (linkQuery.error) {
    return json({ error: linkQuery.error.message }, 500);
  }
  const clientIds = [
    ...new Set(links.map((link) => link.client_id).filter(Boolean)),
  ];
  const { data: linkedClients } = clientIds.length
    ? await admin
        .from("clients")
        .select("id, name, agency_id")
        .in("id", clientIds)
    : { data: [] };
  const agencyIds = [
    ...new Set(
      [
        ...links.map((link) => link.agency_id),
        ...(linkedClients || []).map((client) => client.agency_id),
      ].filter(Boolean),
    ),
  ];
  const { data: linkedAgencies } = agencyIds.length
    ? await admin.from("agencies").select("id, name").in("id", agencyIds)
    : { data: [] };
  const groups = groupsReadyToIntroduce(
    attachGroupAffiliations(selected, links, linkedClients, linkedAgencies),
  );
  if (groups.length === 0) {
    return json({
      ok: true,
      groups: 0,
      codes: 0,
      skipped: selected.length,
      reason: "missing_client_or_agency",
    });
  }

  const phoneNumbers = phones.map((phone) => phone.phone);
  for (const group of groups) {
    const { error: expireError } = await admin
      .from("wa_pending_activations")
      .update({ status: "expired", completed_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("group_chat_id", group.group_chat_id)
      .eq("status", "pending")
      .in("phone", phoneNumbers);
    if (expireError && /group_chat_id/.test(expireError.message || "")) {
      return json(
        { error: "group verification migration is not applied" },
        409,
      );
    }
  }

  const activations: Array<{ phone: string; text: string }> = [];
  for (const group of groups) {
    for (const phone of phones) {
      const code = generateVerificationCode();
      const { error } = await admin.from("wa_pending_activations").insert({
        tenant_id: tenantId,
        integration_id: integ.id,
        phone: phone.phone,
        code,
        group_chat_id: group.group_chat_id,
      });
      if (error) {
        if (/group_chat_id/.test(error.message || "")) {
          return json(
            { error: "group verification migration is not applied" },
            409,
          );
        }
        continue;
      }
      activations.push({
        phone: phone.phone,
        text: privateCodeMessage({
          name: phone.name,
          agencyName: group.agency_name,
          code,
        }),
      });
    }
  }
  if (activations.length === 0) {
    return json({ ok: true, groups: 0, codes: 0, reason: "nothing_stored" });
  }

  const send = async (payload: Record<string, unknown>) => {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/send-manus-wa-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          tenantId,
          integrationId: integ.id,
          senderUserId: integ.user_id,
          ...payload,
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[carmen-introduce-group] send failed", res.status, detail);
    }
  };

  for (const group of groups) {
    await send({
      groupId: group.id,
      message: introMessage({
        agencyName: group.agency_name,
        clientName: group.client_name,
      }),
      // Carmen introduces herself in the client's group: logged on the
      // client card when the group belongs to one client (AIO-242).
      sendKind: "carmen",
    });
  }
  for (const activation of activations) {
    await send({
      phoneNumber: activation.phone,
      message: activation.text,
    });
  }

  return json({
    ok: true,
    groups: groups.length,
    codes: activations.length,
    skipped: selected.length - groups.length,
  });
});
