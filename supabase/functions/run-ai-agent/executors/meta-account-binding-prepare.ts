import type { ConnectClientMetaAdAccountArgs } from "./google-ad-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { validateMetaAdPlatform } from "../../_shared/client-report-sync.ts";
import { parseMetaAdAccountIdInput } from "../../_shared/client-report-sync.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";
import { normalizeMetaAdAccountId } from "../../_shared/client-report-sync.ts";
import { readMetaAdAccountBinding } from "../tool-storage-contracts.ts";
import { metaAdAccountsEqual } from "../../_shared/client-report-sync.ts";

/** Resolves binding conflicts and confirmation before any account write. */
export async function prepareMetaAccountBinding(
  args: ConnectClientMetaAdAccountArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;
  const { client_id, ad_account_id, account_name, platform, confirm_replace } =
    args;
  const clientId = asUuidOrNull(client_id);
  if (!clientId) {
    return { result: { error: "client_id חייב להיות UUID תקין" } };
  }
  if (!ad_account_id) {
    return { result: { error: "ad_account_id נדרש" } };
  }

  const platformCheck = validateMetaAdPlatform(platform);
  if (!platformCheck.ok) {
    return { result: { error: platformCheck.error } };
  }

  const parsed = parseMetaAdAccountIdInput(ad_account_id);
  if (!parsed.ok) {
    return { result: { error: parsed.error } };
  }
  const normalizedAccountId = parsed.accountId;

  await assertCallerCanAccessClient(supabase, clientId, callerScope);

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, name, meta_ads_account_id, agency_id, tenant_id")
    .eq("id", clientId)
    .in("tenant_id", accessibleTenantIds)
    .maybeSingle();
  if (clientErr) {
    throw clientErr;
  }
  if (!client) {
    return { result: { error: "לקוח לא נמצא או מחוץ להרשאות" } };
  }

  const db: AgentDatabaseClient = supabase;
  const { data: fbTables } = await db
    .from("crm_tables")
    .select("id, name, integration_settings")
    .eq("client_id", clientId)
    .in("integration_type", ["facebook_insights", "facebook_ecommerce"])
    .order("last_sync_at", { ascending: false, nullsFirst: false });

  const existingClientAccount = client.meta_ads_account_id
    ? normalizeMetaAdAccountId(client.meta_ads_account_id)
    : null;
  const existingTableAccount =
    (fbTables || [])
      .map((t) => readMetaAdAccountBinding(t.integration_settings))
      .find((id: string | null) => !!id) || null;

  const conflicts = [existingClientAccount, existingTableAccount]
    .filter((id): id is string => !!id)
    .filter((id) => !metaAdAccountsEqual(id, normalizedAccountId));
  const uniqueConflicts = [...new Set(conflicts)];

  if (uniqueConflicts.length > 0 && !confirm_replace) {
    return {
      result: {
        requires_confirmation: true,
        warning: "ללקוח כבר מחובר חשבון Meta אחר. אסור להחליף בלי אישור מפורש.",
        client_id: clientId,
        client_name: client.name,
        existing_accounts: {
          client_meta_ads_account_id: existingClientAccount,
          crm_table_ad_account_id: existingTableAccount,
        },
        proposed_ad_account_id: normalizedAccountId,
        instruction_for_carmen:
          "הציגי לדוד את החשבון הקיים מול המבוקש. רק אחרי אישור מפורש — קראי שוב עם confirm_replace=true.",
      },
    };
  }

  if (
    existingClientAccount &&
    metaAdAccountsEqual(existingClientAccount, normalizedAccountId) &&
    (!existingTableAccount ||
      metaAdAccountsEqual(existingTableAccount, normalizedAccountId))
  ) {
    return {
      result: {
        success: true,
        already_connected: true,
        client_id: clientId,
        client_name: client.name,
        ad_account_id: normalizedAccountId,
        before: { meta_ads_account_id: existingClientAccount },
        after: { meta_ads_account_id: normalizedAccountId },
      },
    };
  }

  return {
    binding: {
      clientId,
      normalizedAccountId,
      platformCheck,
      client,
      fbTables,
      existingClientAccount,
      existingTableAccount,
      uniqueConflicts,
      account_name,
      confirm_replace,
    },
  };
}

export type MetaAccountBinding = Extract<
  Awaited<ReturnType<typeof prepareMetaAccountBinding>>,
  { binding: object }
>["binding"];
