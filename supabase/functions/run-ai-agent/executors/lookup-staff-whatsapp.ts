import { loadStaffWhatsappRoster } from "./staff-whatsapp-roster.ts";
import type { LookupStaffWhatsappArgs } from "./messaging-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { formatStaffContact } from "../../_shared/staff-whatsapp.ts";
import { scoreNameMatchSafe } from "../executors/name-match.ts";

/** Preserves the existing lookup_staff_whatsapp executor and side-effect order. */
export async function executeLookupStaffWhatsapp(
  args: LookupStaffWhatsappArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds } = context;

  const entityType = args.entity_type || "auto";
  const onlyWithPhone = args.only_with_phone !== false;
  const limit = Math.min(Math.max(Number(args.limit) || 40, 1), 100);
  const search = String(args.search || "").trim();
  const roster = await loadStaffWhatsappRoster(
    supabase,
    accessibleTenantIds,
    tenantId,
    entityType,
  );
  let rows = roster
    .map(formatStaffContact)
    .filter((contact) => contact !== null);
  if (onlyWithPhone) {
    rows = rows.filter((r) => r.has_phone);
  }
  if (search) {
    rows = rows
      .filter((r) => scoreNameMatchSafe(r.full_name, search) > 0)
      .sort(
        (a, b) =>
          scoreNameMatchSafe(b.full_name, search) -
          scoreNameMatchSafe(a.full_name, search),
      );
  }
  rows = rows.slice(0, limit);
  return {
    count: rows.length,
    staff: rows,
    note: "השתמשי ב-send_whatsapp_to_staff עם staff_id או name מהרשימה. הטלפון נמשך מה-DB בלבד.",
  };
}
