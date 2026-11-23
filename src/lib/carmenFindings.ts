import { supabase } from "@/integrations/supabase/client";
import { FINDING_LIVE_STATUSES } from "../../supabase/functions/_shared/manager-round/kinds.ts";

/**
 * The query-key prefix of a tenant's Carmen findings: every findings query
 * key starts with it, and every write that changes findings invalidates it.
 */
export function carmenFindingsKey(tenantId: string | null) {
  return ["carmen_findings", tenantId] as const;
}

/**
 * The tenant's live findings with these columns, newest first; RLS limits
 * them to what the viewer may see. Callers add their own filters and limit.
 */
export function selectLiveFindings<Columns extends string>(
  tenantId: string,
  columns: Columns,
) {
  return supabase
    .from("carmen_findings")
    .select(columns)
    .eq("tenant_id", tenantId)
    .in("status", [...FINDING_LIVE_STATUSES])
    .order("last_seen_at", { ascending: false });
}
