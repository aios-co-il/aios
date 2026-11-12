import { supabase } from "@/integrations/supabase/client";
import { buildDefaultShareToken } from "@/lib/share-slug";
import {
  currentUserId,
  type ShareTokenSource,
} from "../ClientReportCard/useShareToken";

/** The report table fields the share token needs. */
type ShareableTable = { id: string; name: string; tenant_id?: string | null };

/** The report's public address, as the share dialog builds it. */
export function buildSharedTableUrl(shareToken: string): string {
  return `https://aios.co.il/shared/table/${shareToken}`;
}

/** The report's share token, read and made in `table_shares`. */
export function tableShareSource(
  table: ShareableTable,
  tenantId: string,
): ShareTokenSource {
  return {
    // Not "table-share-link": the send dialog caches the URL under that key.
    queryKey: ["table-share-token", table.id],
    label: `report table ${table.id}`,
    readActive: () => activeTableShareToken(table.id),
    create: () => createTableShareToken(table, tenantId),
  };
}

/** The newest active share token of the report, across all its rows. */
async function activeTableShareToken(tableId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("table_shares")
    .select("share_token")
    .eq("table_id", tableId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.share_token ?? null;
}

/**
 * Creates a new share row on the table's own tenant, as the share dialog does
 * (it is given `table.tenant_id`). Rows the user turned off stay off.
 */
async function createTableShareToken(
  table: ShareableTable,
  tenantId: string,
): Promise<string> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("table_shares")
    .insert({
      table_id: table.id,
      tenant_id: table.tenant_id || tenantId,
      created_by: userId,
      allowed_emails: [],
      share_token: buildDefaultShareToken({ fallbackName: table.name }),
    })
    .select("share_token")
    .single();
  if (error) {
    throw error;
  }
  return data.share_token;
}
