// Carmen's list_updates for a client card (AIO-232): every entry on a client
// whose card the caller's tenant may read, with the author, update_type and
// source, so Carmen can tell who logged what and which entries were written
// automatically.

import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  CLIENT_CARD_SOURCES,
  clientCardSourceCanCountAsContact,
  clientCardSourceLabel,
} from "../_shared/client-card/sources.ts";

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

export type ClientCardListResult =
  | { error: "not_found"; message: string }
  | {
      count: number;
      updates: ClientCardListRow[];
      instructions_to_agent: string;
    };

/**
 * Carmen's list_updates for a client: the caller's tenant must be able to
 * read the client's card (callerCanReadClientCard); its entries come from
 * every org that writes on it, with author, type and source.
 */
export async function listClientCardEntries(
  supabase: Pick<DbClient, "from">,
  input: {
    clientId: string;
    tenantId: string;
    accessibleTenantIds: string[];
    limit?: unknown;
  },
): Promise<ClientCardListResult> {
  const requested = Number(input.limit);
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), 100)
      : 10;
  if (!(await callerCanReadClientCard(supabase, input))) {
    return {
      error: "not_found",
      message: "הלקוח לא נמצא בארגון הזה",
    };
  }
  // One shared card: the access check above is the tenant scope; an entry's
  // tenant_id is the org that wrote it, which may be another org sharing the
  // client's agency.
  const { data, error } = await supabase
    .from("client_updates")
    .select(
      "id, content, created_at, update_type, source, counts_as_contact, user_id, profiles:user_id (full_name, email)",
    )
    .eq("client_id", input.clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }
  const updates = (data || []).map(mapClientCardRow);
  return {
    count: updates.length,
    updates,
    instructions_to_agent: listInstructions(),
  };
}

/**
 * Whether the caller's tenant may read a client's card: the client is its
 * own, or the client's tenant shares the client's agency with it
 * (agency_tenant_access), the rule record_client_card_entry applies to
 * writes. accessibleTenantIds holds every tenant that shares any agency with
 * the caller, so on its own it would also open that tenant's clients in
 * agencies it never shared.
 */
async function callerCanReadClientCard(
  supabase: Pick<DbClient, "from">,
  input: { clientId: string; tenantId: string; accessibleTenantIds: string[] },
): Promise<boolean> {
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("tenant_id, agency_id")
    .eq("id", input.clientId)
    .in("tenant_id", input.accessibleTenantIds)
    .maybeSingle();
  if (clientError) {
    throw clientError;
  }
  if (!client) {
    return false;
  }
  if (client.tenant_id === input.tenantId) {
    return true;
  }
  if (!client.tenant_id || !client.agency_id) {
    return false;
  }
  const { data: access, error: accessError } = await supabase
    .from("agency_tenant_access")
    .select("id")
    .eq("accessing_tenant_id", input.tenantId)
    .eq("source_tenant_id", client.tenant_id)
    .eq("agency_id", client.agency_id)
    .limit(1)
    .maybeSingle();
  if (accessError) {
    throw accessError;
  }
  return access !== null;
}

interface AuthorProfile {
  full_name?: string | null;
  email?: string | null;
}

interface ClientCardRow {
  id: string;
  content: string | null;
  created_at: string;
  update_type?: string | null;
  source?: string | null;
  counts_as_contact?: boolean | null;
  profiles?: AuthorProfile | AuthorProfile[] | null;
}

/** Shape one client_updates row, with its author's profile, for Carmen. */
export function mapClientCardRow(row: ClientCardRow): ClientCardListRow {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const author = profile?.full_name?.trim() || profile?.email?.trim() || null;
  const source = row.source || "human";
  return {
    id: row.id,
    content: row.content ?? "",
    created_at: row.created_at,
    update_type: row.update_type ?? null,
    source,
    source_label: clientCardSourceLabel(source) ?? "צוות",
    author,
    counts_as_contact: row.counts_as_contact ?? null,
  };
}

/** Tells Carmen which sources mean an entry was written automatically. */
function listInstructions(): string {
  const automatic = CLIENT_CARD_SOURCES.filter(
    (source) => !clientCardSourceCanCountAsContact(source),
  );
  const last = automatic[automatic.length - 1];
  return `author הוא האדם שהעדכון משויך אליו. כש-source הוא ${automatic.slice(0, -1).join(", ")} או ${last} — העדכון נכתב אוטומטית ולא על ידי אותו אדם. carmen_confirmed הוא עדכון שרשמת לבקשתו.`;
}
