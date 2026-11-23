import type { ToolExecutionContext } from "../tool-context.ts";
import type { MetaAccountBinding } from "./meta-account-binding-prepare.ts";
import { recordClientCardEntry } from "../../_shared/client-card/entry.ts";

export type UpdatedMetaBindingTable = {
  table_id: string;
  name: string;
  previous_ad_account_id: string | null;
};

/** Keeps action, communication, and card recording after all binding writes. */
export async function recordMetaAccountBindingAudit(
  binding: MetaAccountBinding,
  updatedTables: Array<UpdatedMetaBindingTable>,
  effectiveUserId: string | null,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;
  const {
    clientId,
    normalizedAccountId,
    platformCheck,
    client,
    existingClientAccount,
    existingTableAccount,
    uniqueConflicts,
    account_name,
    confirm_replace,
  } = binding;
  const note =
    `[כרמן] חיבור חשבון Meta ${normalizedAccountId}` +
    (account_name ? ` (${account_name})` : "") +
    ` ללקוח ${client.name}` +
    (uniqueConflicts.length > 0
      ? ` — הוחלף מ-${uniqueConflicts.join(", ")}`
      : existingClientAccount
        ? ""
        : " (חדש)");

  await supabase
    .from("agent_action_log")
    .insert({
      tenant_id: tenantId,
      action_type: "connect_client_meta_ad_account",
      status: "success",
      action_details: {
        client_id: clientId,
        client_name: client.name,
        ad_account_id: normalizedAccountId,
        account_name: account_name ?? null,
        platform: platformCheck.platform,
        previous_client_account: existingClientAccount,
        previous_table_account: existingTableAccount,
        updated_tables: updatedTables,
        confirm_replace: !!confirm_replace,
      },
    })
    .then(
      () => {},
      () => {},
    );

  await supabase
    .from("communication_logs")
    .insert({
      client_id: clientId,
      tenant_id: tenantId,
      status: "normal",
      interaction_type: "system_alert",
      note,
      updated_by: effectiveUserId,
    })
    .then(
      () => {},
      () => {},
    );

  await recordClientCardEntry(supabase, {
    tenantId,
    clientId,
    content: note,
    source: "carmen",
    attributedUserId: effectiveUserId,
    metadata: { tool: "connect_client_meta_ad_account" },
  }).catch((err) =>
    console.warn(
      "[connect_client_meta_ad_account] client card entry failed",
      err,
    ),
  );
}
