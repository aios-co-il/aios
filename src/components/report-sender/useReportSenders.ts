import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";

export type ReportSenderOptions = {
  /** Own and shared Green API and Manus lines, without secrets. */
  senders: ReportSender[];
  /** tenant_report_settings.whatsapp_integration_id. */
  tenantDefaultId: string | null;
  /** Whether the viewer may change the tenant default. */
  canManage: boolean;
};

/** Query key shared by the list and the default-line mutation. */
export const reportSendersKey = (tenantId: string | null | undefined) =>
  ["report-whatsapp-senders", tenantId] as const;

/** The lines a tenant may send reports from, and its default line. */
export function useReportSenders(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: reportSendersKey(tenantId),
    queryFn: tenantId ? () => fetchReportSenders(tenantId) : skipToken,
    staleTime: 60_000,
  });
}

/** Reads the RPC (lines shared from other tenants included) and the default. */
async function fetchReportSenders(
  tenantId: string,
): Promise<ReportSenderOptions> {
  const [list, settings] = await Promise.all([
    supabase.rpc("list_report_whatsapp_senders", { p_tenant_id: tenantId }),
    supabase
      .from("tenant_report_settings")
      .select("whatsapp_integration_id")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  if (list.error) {
    throw list.error;
  }
  if (settings.error) {
    throw settings.error;
  }
  const senders: ReportSender[] = list.data ?? [];
  return {
    senders,
    tenantDefaultId: settings.data?.whatsapp_integration_id ?? null,
    canManage: senders.some((sender) => sender.caller_can_manage),
  };
}
