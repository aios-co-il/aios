import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCarmenReportRecipients } from "../../../../supabase/functions/_shared/carmen-report-recipients/resolve.ts";

/**
 * The organization's report list, its staff, the listed phones that now
 * belong to a client, and what the server will do with them (the same
 * resolver and inputs the edge functions use).
 */
export function useReportRecipients(tenantId: string) {
  const list = useQuery({
    queryKey: reportRecipientsKey(tenantId),
    queryFn: tenantId ? () => fetchReportRecipients(tenantId) : skipToken,
  });
  const staff = useQuery({
    queryKey: [...reportRecipientsKey(tenantId), "staff"],
    queryFn: tenantId ? () => fetchReportStaff(tenantId) : skipToken,
  });
  const clientPhones = useQuery({
    queryKey: [...reportRecipientsKey(tenantId), "client_phones"],
    queryFn: tenantId ? () => fetchReportClientPhones(tenantId) : skipToken,
  });
  const queries = [list, staff, clientPhones];
  const rows = list.data ?? [];
  const members = staff.data ?? [];
  return {
    rows,
    staff: members,
    resolved: resolveCarmenReportRecipients({
      configured: rows,
      staff: members,
      clientPhones: clientPhones.data ?? [],
    }),
    isLoading: queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
  };
}

/** Query key prefix the recipient mutations invalidate. */
export const reportRecipientsKey = (tenantId: string) =>
  ["carmen_report_recipients", tenantId] as const;

/** carmen_report_recipients rows of one tenant, oldest first (the send order). */
async function fetchReportRecipients(tenantId: string) {
  const { data, error } = await supabase
    .from("carmen_report_recipients")
    .select("id, user_id, phone, label")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return data;
}

/** Staff of the tenant with the phone Carmen would use (owners only). */
async function fetchReportStaff(tenantId: string) {
  const { data, error } = await supabase.rpc("carmen_report_staff", {
    p_tenant_id: tenantId,
  });
  if (error) {
    throw error;
  }
  return data;
}

/** Listed extra phones that now belong to a client (owners only). */
async function fetchReportClientPhones(tenantId: string) {
  const { data, error } = await supabase.rpc("carmen_report_client_phones", {
    p_tenant_id: tenantId,
  });
  if (error) {
    throw error;
  }
  return data;
}
