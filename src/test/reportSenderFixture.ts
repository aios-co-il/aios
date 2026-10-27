import type { ReportSender } from "../../supabase/functions/_shared/report-sender/types.ts";

/** A ready Green API line of tenant t1, unless overridden. */
export function reportSender(
  id: string,
  overrides: Partial<ReportSender> = {},
): ReportSender {
  return {
    id,
    integration_type: "green_api",
    display_name: null,
    last4: null,
    owner_user_id: null,
    owner_name: null,
    owner_tenant_id: "t1",
    owner_tenant_name: null,
    is_shared: false,
    carmen_role: null,
    ready: true,
    group_chat_ids: null,
    caller_can_manage: false,
    ...overrides,
  };
}
