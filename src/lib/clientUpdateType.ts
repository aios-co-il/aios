import { clientCardSourceCanCountAsContact } from "../../supabase/functions/_shared/client-card/sources.ts";

/**
 * Whether a client_updates row counts as documented client contact for the
 * pulse. Mirrors get_latest_client_call_updates: only human or
 * carmen_confirmed rows count, as a פגישה / שיחה (`call`) or with
 * counts_as_contact, which the database stamps when the text reports a held
 * call or meeting (client_update_reports_contact, AIO-516).
 */
export function isClientCallUpdate(
  updateType: string | null | undefined,
  source?: string | null,
  countsAsContact?: boolean | null,
): boolean {
  if (!clientCardSourceCanCountAsContact(source)) {
    return false;
  }
  return countsAsContact === true || updateType === "call";
}
