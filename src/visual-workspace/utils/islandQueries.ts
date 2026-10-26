import { supabase } from "@/integrations/supabase/client";
import type { IslandId } from "../types/visualWorkspaceTypes";
import {
  readIslandAgents,
  readIslandItems,
  type IdRows,
  type IslandAgent,
  type IslandItem,
} from "./islandRows";

const items = (rows: IdRows): IslandItem[] => readIslandItems(rows ?? []);

type ItemsQuery = (tenantId: string) => Promise<IslandItem[]>;

const ITEM_QUERIES: Partial<Record<IslandId, ItemsQuery>> = {
  marketing: async (tenantId) =>
    items(
      (
        await supabase
          .from("automations")
          .select("id,name,is_active,trigger_type")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(15)
      ).data,
    ),
  sales: async (tenantId) =>
    items(
      (
        await supabase
          .from("leads")
          .select("id,name,phone,status,created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(15)
      ).data,
    ),
  creative: async (tenantId) =>
    items(
      (
        await supabase
          .from("social_publications")
          .select("id,content,status,scheduled_at")
          .eq("tenant_id", tenantId)
          .order("scheduled_at", { ascending: false, nullsFirst: false })
          .limit(15)
      ).data,
    ),
  finance: async (tenantId) =>
    items(
      (
        await supabase
          .from("supplier_invoices")
          .select("id,supplier_name,amount,status,invoice_date")
          .eq("tenant_id", tenantId)
          .order("invoice_date", { ascending: false })
          .limit(15)
      ).data,
    ),
  development: async (tenantId) =>
    items(
      (
        await supabase
          .from("automation_executions")
          .select("id,automation_id,status,created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(15)
      ).data,
    ),
  customer_success: async (tenantId) =>
    items(
      (
        await supabase
          .from("clients")
          .select("id,name,status,mood_status,health_score")
          .eq("tenant_id", tenantId)
          .order("name")
          .limit(20)
      ).data,
    ),
  system: async (tenantId) =>
    items(
      (
        await supabase
          .from("tenant_integrations")
          .select("id,integration_name,is_active")
          .eq("tenant_id", tenantId)
          .limit(20)
      ).data,
    ),
  agents: async (tenantId) => items((await fetchAgentRows(tenantId, 20)).data),
  management: async (tenantId) =>
    items(
      (
        await supabase
          .from("goals")
          .select("id,title,status,progress")
          .eq("tenant_id", tenantId)
          .neq("status", "completed")
          .limit(15)
      ).data,
    ),
};

function fetchAgentRows(tenantId: string, limit: number) {
  return supabase
    .from("ai_agents")
    .select("id,name,role,model,active")
    .eq("tenant_id", tenantId)
    .limit(limit);
}

export async function fetchIslandItems(
  islandId: IslandId,
  tenantId: string,
): Promise<IslandItem[]> {
  const query = ITEM_QUERIES[islandId];
  return query ? query(tenantId) : [];
}

export async function fetchIslandAgents(
  tenantId: string,
): Promise<IslandAgent[]> {
  const rows: IdRows = (await fetchAgentRows(tenantId, 10)).data;
  return readIslandAgents(rows ?? []);
}
