import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildDefaultShareToken } from "@/lib/share-slug";
import {
  currentUserId,
  type ShareTokenSource,
} from "../ClientReportCard/useEnsureShareToken";

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
    readActive: async () => {
      const latest = await latestTableShare(table.id);
      return latest?.is_active ? latest.share_token : null;
    },
    ensure: () => ensureTableShareToken(table, tenantId),
  };
}

/**
 * Reactivates the report's newest share row, or creates one on the table's
 * own tenant, as the share dialog does (it is given `table.tenant_id`).
 */
async function ensureTableShareToken(
  table: ShareableTable,
  tenantId: string,
): Promise<string> {
  const latest = await latestTableShare(table.id);
  if (latest) {
    if (!latest.is_active) {
      const { error } = await supabase
        .from("table_shares")
        .update({ is_active: true })
        .eq("table_id", table.id)
        .eq("share_token", latest.share_token);
      if (error) {
        throw error;
      }
    }
    return latest.share_token;
  }
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
  toast.success("נוצר קישור שיתוף חדש");
  return data.share_token;
}

/** The report's newest share row, active or not, so none is duplicated. */
async function latestTableShare(tableId: string) {
  const { data, error } = await supabase
    .from("table_shares")
    .select("share_token, is_active")
    .eq("table_id", tableId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}
