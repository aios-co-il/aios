import { prepareMetaAccountBinding } from "./meta-account-binding-prepare.ts";
import {
  recordMetaAccountBindingAudit,
  type UpdatedMetaBindingTable,
} from "./meta-account-binding-audit.ts";
import type { ConnectClientMetaAdAccountArgs } from "./google-ad-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

import { readMetaAdAccountBinding } from "../tool-storage-contracts.ts";

/** Preserves the existing connect_client_meta_ad_account executor and side-effect order. */
export async function executeConnectClientMetaAdAccount(
  args: ConnectClientMetaAdAccountArgs,
  context: ToolExecutionContext,
) {
  const { supabase, userId, accessibleTenantIds } = context;

  const prepared = await prepareMetaAccountBinding(args, context);
  if ("result" in prepared) {
    return prepared.result;
  }
  const {
    clientId,
    normalizedAccountId,
    platformCheck,
    client,
    fbTables,
    existingClientAccount,
    existingTableAccount,
    uniqueConflicts,
    account_name,
  } = prepared.binding;
  let effectiveUserId = userId !== "system" ? userId : null;
  if (!effectiveUserId) {
    const { data: ownerRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("tenant_id", accessibleTenantIds)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    effectiveUserId = ownerRole?.user_id || null;
  }

  const { error: updateErr } = await supabase
    .from("clients")
    .update({ meta_ads_account_id: normalizedAccountId })
    .eq("id", clientId)
    .in("tenant_id", accessibleTenantIds);
  if (updateErr) {
    throw updateErr;
  }

  const updatedTables: Array<UpdatedMetaBindingTable> = [];
  for (const table of fbTables || []) {
    const prev = readMetaAdAccountBinding(table.integration_settings);
    const nextSettings = {
      ...(table.integration_settings !== null &&
      typeof table.integration_settings === "object" &&
      !Array.isArray(table.integration_settings)
        ? table.integration_settings
        : {}),
      ad_account_id: normalizedAccountId,
      ...(account_name ? { ad_account_name: account_name } : {}),
    };
    const { error: tableErr } = await supabase
      .from("crm_tables")
      .update({ integration_settings: nextSettings })
      .eq("id", table.id);
    if (tableErr) {
      throw tableErr;
    }
    updatedTables.push({
      table_id: table.id,
      name: table.name,
      previous_ad_account_id: prev,
    });
  }

  await recordMetaAccountBindingAudit(
    prepared.binding,
    updatedTables,
    effectiveUserId,
    context,
  );
  return {
    success: true,
    client_id: clientId,
    client_name: client.name,
    ad_account_id: normalizedAccountId,
    platform: platformCheck.platform,
    before: {
      meta_ads_account_id: existingClientAccount,
      crm_table_ad_account_id: existingTableAccount,
    },
    after: {
      meta_ads_account_id: normalizedAccountId,
      crm_tables_updated: updatedTables,
    },
    replaced_existing: uniqueConflicts.length > 0,
  };
}
