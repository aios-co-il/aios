// Share automation as a read-only mirror to other tenants.
// (Name kept as "clone-automation-to-tenant" for backwards-compat with existing UI callers.)
// The automation itself stays in the source tenant — only one trigger fires.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { asList, messageOf, prop } from "../_shared/automation-json.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = serviceClient();
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: unknown = await req.json().catch(() => ({}));
    const rawAutomationId = prop(body, "automation_id");
    const automationId =
      typeof rawAutomationId === "string" ? rawAutomationId : "";
    const targetTenantIds = asList(prop(body, "target_tenant_ids")).map((id) =>
      String(id),
    );

    if (!automationId || targetTenantIds.length === 0) {
      return new Response(
        JSON.stringify({
          error: "automation_id and target_tenant_ids are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: source, error: srcErr } = await admin
      .from("automations")
      .select("id, tenant_id, name")
      .eq("id", automationId)
      .maybeSingle();
    if (srcErr || !source) {
      return new Response(
        JSON.stringify({ error: "Source automation not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: roles } = await admin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", user.id);
    const isSuperAdmin = (roles || []).some((r) => r.role === "super_admin");
    const ADMIN_ROLES = new Set(["owner", "team_manager", "agency_owner"]);
    const hasSourceAdmin =
      isSuperAdmin ||
      (roles || []).some(
        (r) => r.tenant_id === source.tenant_id && ADMIN_ROLES.has(r.role),
      );
    if (!hasSourceAdmin) {
      return new Response(
        JSON.stringify({ error: "No permission on source automation" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: memberships } = await admin
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id);
    const memberTenantIds = new Set(
      (memberships || []).map((m) => m.tenant_id),
    );

    const results: Array<{
      tenant_id: string;
      success: boolean;
      error?: string;
    }> = [];
    for (const targetTenantId of targetTenantIds) {
      try {
        if (targetTenantId === source.tenant_id) {
          results.push({
            tenant_id: targetTenantId,
            success: false,
            error: "Cannot share to source tenant",
          });
          continue;
        }
        if (!isSuperAdmin && !memberTenantIds.has(targetTenantId)) {
          results.push({
            tenant_id: targetTenantId,
            success: false,
            error: "Not a member of target tenant",
          });
          continue;
        }

        const { error: insErr } = await admin
          .from("automation_shared_tenants")
          .upsert(
            {
              automation_id: source.id,
              tenant_id: targetTenantId,
              shared_by: user.id,
            },
            { onConflict: "automation_id,tenant_id" },
          );

        if (insErr) {
          results.push({
            tenant_id: targetTenantId,
            success: false,
            error: insErr.message,
          });
          continue;
        }
        results.push({ tenant_id: targetTenantId, success: true });
      } catch (e) {
        results.push({
          tenant_id: targetTenantId,
          success: false,
          error: messageOf(e) || "Unknown error",
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("share-automation error:", error);
    return new Response(
      JSON.stringify({ error: messageOf(error) || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
