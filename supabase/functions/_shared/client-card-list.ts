// Carmen's list_updates for a client card (AIO-232): tenant-scoped rows with
// the author, update_type and source, so Carmen can tell who logged what and
// which entries were written automatically.

import { clientCardSourceLabel } from "./client-card-sources.ts";

export interface ClientCardListRow {
  id: string;
  content: string;
  created_at: string;
  update_type: string | null;
  source: string;
  source_label: string;
  author: string | null;
  counts_as_contact: boolean | null;
}

export function mapClientCardRow(row: any): ClientCardListRow {
  const profile = Array.isArray(row?.profiles)
    ? row.profiles[0]
    : row?.profiles;
  const author =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? "").trim() ||
    null;
  const source =
    typeof row?.source === "string" && row.source ? row.source : "human";
  return {
    id: row?.id,
    content: row?.content ?? "",
    created_at: row?.created_at,
    update_type: row?.update_type ?? null,
    source,
    source_label: clientCardSourceLabel(source) ?? "צוות",
    author,
    counts_as_contact:
      typeof row?.counts_as_contact === "boolean"
        ? row.counts_as_contact
        : null,
  };
}

/** Carmen's list_updates for a client: tenant-scoped, with author, type and source. */
export async function listClientCardEntries(
  supabase: any,
  input: { clientId: string; accessibleTenantIds: string[]; limit?: unknown },
): Promise<Record<string, unknown>> {
  const requested = Number(input.limit);
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), 100)
      : 10;
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", input.clientId)
    .in("tenant_id", input.accessibleTenantIds)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!client)
    return {
      error: "not_found",
      message: "הלקוח לא נמצא בארגון הזה",
    };
  const { data, error } = await supabase
    .from("client_updates")
    .select(
      "id, content, created_at, update_type, source, counts_as_contact, user_id, profiles:user_id (full_name, email)",
    )
    .eq("client_id", input.clientId)
    .in("tenant_id", input.accessibleTenantIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const updates = (data || []).map(mapClientCardRow);
  return {
    count: updates.length,
    updates,
    instructions_to_agent:
      "author הוא האדם שהעדכון משויך אליו. כש-source הוא carmen, automation, system_send או group_digest — העדכון נכתב אוטומטית ולא על ידי אותו אדם. carmen_confirmed הוא עדכון שרשמת לבקשתו.",
  };
}
