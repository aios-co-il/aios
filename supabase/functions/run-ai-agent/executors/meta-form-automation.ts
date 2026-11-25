import type { Tables } from "../../_shared/database.types.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { metaNameMatches } from "./meta-lead-name-match.ts";

export async function findAutomationForMetaForm(
  supabase: DbClient,
  tenantIds: Array<string>,
  automationId?: unknown,
  automationName?: unknown,
) {
  const matches: Array<
    Pick<Tables<"automations">, "id" | "name" | "active" | "tenant_id">
  > = [];
  const pageSize = 100;
  let cursor: { name: string; id: string } | undefined;
  for (;;) {
    let query = supabase
      .from("automations")
      .select("id, name, active, tenant_id")
      .in("tenant_id", tenantIds)
      .eq("is_flow", true);
    if (automationId) {
      query = query.eq("id", String(automationId));
    }
    if (cursor) {
      const name = JSON.stringify(cursor.name);
      query = query.or(
        `name.gt.${name},and(name.eq.${name},id.gt.${cursor.id})`,
      );
    }
    const { data, error } = await query
      .order("name")
      .order("id")
      .limit(pageSize);
    if (error) {
      throw error;
    }
    const page = data || [];
    matches.push(
      ...page.filter(
        (a) =>
          (!automationName || metaNameMatches(a.name, automationName)) &&
          !matches.some((match) => match.id === a.id),
      ),
    );
    if (automationId || page.length < pageSize) {
      break;
    }
    cursor = page[page.length - 1];
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
