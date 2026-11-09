import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { AgentRow } from "../database-contracts.ts";
import { normalizeStaffPhone } from "../../_shared/staff-whatsapp.ts";

/** Load campaigners / sales_people / tenant profiles as a unified staff roster. */
export async function loadStaffWhatsappRoster(
  supabase: AgentDatabaseClient,
  accessibleTenantIds: Array<string>,
  tenantId: string,
  entityType: string = "auto",
): Promise<
  Array<{
    id: string;
    full_name: string;
    phone: string | null;
    entity_type: string;
    role?: AgentRow<"campaigners">["role"];
    email?: string | null;
  }>
> {
  const want = entityType || "auto";
  const out: Array<{
    id: string;
    full_name: string;
    phone: string | null;
    entity_type: string;
    role?: AgentRow<"campaigners">["role"];
    email?: string | null;
  }> = [];

  if (want === "auto" || want === "campaigner") {
    const { data } = await supabase
      .from("campaigners")
      .select("id, full_name, phone, email, role")
      .in("tenant_id", accessibleTenantIds)
      .order("full_name")
      .limit(200);
    for (const r of data || []) {
      out.push({
        id: r.id,
        full_name: r.full_name,
        phone: r.phone,
        email: r.email,
        role: r.role,
        entity_type: "campaigner",
      });
    }
  }

  if (want === "auto" || want === "sales_person") {
    const { data } = await supabase
      .from("sales_people")
      .select("id, full_name, phone, email")
      .in("tenant_id", accessibleTenantIds)
      .order("full_name")
      .limit(200);
    for (const r of data || []) {
      out.push({
        id: r.id,
        full_name: r.full_name,
        phone: r.phone,
        email: r.email,
        entity_type: "sales_person",
      });
    }
  }

  if (want === "auto" || want === "team_member") {
    // Profiles linked to this tenant (team logins). Prefer profile.phone; else linked campaigner/sales phone.
    const { data: tus } = await supabase
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .limit(200);
    const userIds = (tus || []).map((t) => t.user_id).filter(Boolean);
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, phone, campaigner_id, sales_person_id, email")
        .in("id", userIds)
        .limit(200);
      for (const p of profiles || []) {
        let phone = p.phone;
        if (!normalizeStaffPhone(phone) && p.campaigner_id) {
          const hit = out.find(
            (x) => x.entity_type === "campaigner" && x.id === p.campaigner_id,
          );
          phone = hit?.phone || phone;
        }
        if (!normalizeStaffPhone(phone) && p.sales_person_id) {
          const hit = out.find(
            (x) =>
              x.entity_type === "sales_person" && x.id === p.sales_person_id,
          );
          phone = hit?.phone || phone;
        }
        out.push({
          id: p.id,
          full_name: p.full_name || "Team member",
          phone,
          email: p.email,
          entity_type: "team_member",
        });
      }
    }
  }

  return out;
}
