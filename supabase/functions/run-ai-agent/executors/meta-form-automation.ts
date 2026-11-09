import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { AgentRow } from "../database-contracts.ts";
import { metaNameMatches } from "./meta-lead-name-match.ts";

/** Preserves the existing findAutomationForMetaForm behavior at its extracted boundary. */
export async function findAutomationForMetaForm(
  supabase: AgentDatabaseClient,
  tenantIds: Array<string>,
  automationId?: unknown,
  automationName?: unknown,
) {
  let query = supabase
    .from("automations")
    .select("id, name, active, tenant_id")
    .in("tenant_id", tenantIds)
    .eq("is_flow", true);
  if (automationId) {
    query = query.eq("id", String(automationId));
  }
  const { data, error } = await query.order("name").limit(100).returns<
    Array<
      Pick<AgentRow<"automations">, "id" | "name" | "active"> & {
        tenant_id: string | null;
      }
    >
  >();
  if (error) {
    throw error;
  }
  let matches = data || [];
  if (automationName) {
    matches = matches.filter((a) => metaNameMatches(a.name, automationName));
  }
  if (matches.length === 0) {
    throw new Error("לא נמצאה אוטומציה תואמת בארגון");
  }
  if (matches.length > 1) {
    throw new Error(
      `נמצאו כמה אוטומציות תואמות: ${matches.map((a) => `${a.name} (${a.id})`).join(", ")}. יש לציין שם מדויק או automation_id`,
    );
  }
  const match = matches[0];
  if (!match.tenant_id) {
    throw new Error("Automation has no tenant");
  }
  return { ...match, tenant_id: match.tenant_id };
}
