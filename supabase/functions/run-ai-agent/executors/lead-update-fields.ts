import type { TablesUpdate } from "../../_shared/database.types.ts";

export interface LeadFields {
  company_name?: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string;
  notes?: string | null;
  follow_up_date?: string | null;
}

/** Preserves the lead update field selection and undefined-value handling. */
export function leadUpdateFields(args: LeadFields): TablesUpdate<"leads"> {
  const updates: TablesUpdate<"leads"> = {};
  if (args.company_name) {
    updates.company_name = args.company_name;
  }
  if (args.contact_name !== undefined) {
    updates.contact_name = args.contact_name;
  }
  if (args.phone !== undefined) {
    updates.phone = args.phone;
  }
  if (args.email !== undefined) {
    updates.email = args.email;
  }
  if (args.source !== undefined) {
    updates.source = args.source;
  }
  if (args.notes !== undefined) {
    updates.notes = args.notes;
  }
  if (args.follow_up_date !== undefined) {
    updates.follow_up_date = args.follow_up_date;
  }
  return updates;
}
