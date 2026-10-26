/** CRM WhatsApp send for meeting reminders. Keep pick order in sync with src/lib/crmWhatsappRoute.ts. */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { asRecord, asRecords, optString } from "./provider-json.ts";
import { type IntegrationRow, integrationRows } from "./crm-whatsapp-rows.ts";

type AdminClient = SupabaseClient;

export type CrmWaProvider =
  "green_api" | "manus_wa" | "meta_whatsapp" | "manychat";

const WA_ORDER: CrmWaProvider[] = [
  "green_api",
  "manus_wa",
  "meta_whatsapp",
  "manychat",
];

export function pickCrmWhatsappIntegration(
  preferred: string | null | undefined,
  integrations: IntegrationRow[],
): { id: string; type: CrmWaProvider; user_id: string | null } | null {
  if (!integrations.length) return null;
  if (preferred) {
    const match = integrations.find(
      (row) => row.integration_type === preferred,
    );
    if (match && WA_ORDER.includes(match.integration_type as CrmWaProvider)) {
      return {
        id: match.id,
        type: match.integration_type as CrmWaProvider,
        user_id: match.user_id ?? null,
      };
    }
  }
  for (const type of WA_ORDER) {
    const match = integrations.find((row) => row.integration_type === type);
    if (match) {
      return { id: match.id, type, user_id: match.user_id ?? null };
    }
  }
  return null;
}

function functionName(type: CrmWaProvider): string {
  if (type === "manus_wa") return "send-manus-wa-message";
  if (type === "meta_whatsapp") return "send-meta-whatsapp-message";
  if (type === "manychat") return "send-chat-message";
  return "send-green-api-message";
}

async function loadTenantWhatsappIntegrations(
  admin: AdminClient,
  tenantId: string,
) {
  const [ownedResult, grantsResult] = await Promise.all([
    admin
      .from("tenant_integrations")
      .select("id, integration_type, user_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("integration_type", WA_ORDER),
    admin
      .from("integration_tenant_access")
      .select("integration_id")
      .eq("accessing_tenant_id", tenantId),
  ]);
  const owned: unknown = ownedResult.data;
  const grants: unknown = grantsResult.data;
  const grantedIds = asRecords(grants).flatMap((row) => {
    const id = optString(row.integration_id);
    return id === undefined ? [] : [id];
  });
  let shared: IntegrationRow[] = [];
  if (grantedIds.length > 0) {
    const { data }: { data: unknown } = await admin
      .from("tenant_integrations")
      .select("id, integration_type, user_id")
      .in("id", grantedIds)
      .eq("is_active", true)
      .in("integration_type", WA_ORDER);
    shared = integrationRows(data);
  }
  const unique = new Map<string, IntegrationRow>();
  for (const row of [...integrationRows(owned), ...shared]) {
    unique.set(row.id, row);
  }
  return Array.from(unique.values());
}

export async function sendCrmWhatsappToLeadAdmin(input: {
  admin: AdminClient;
  supabaseUrl: string;
  serviceKey: string;
  leadId: string;
  message: string;
}): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const {
    data: leadData,
    error: leadError,
  }: { data: unknown; error: { message: string } | null } = await input.admin
    .from("leads")
    .select("id, phone, tenant_id, active_chat_provider")
    .eq("id", input.leadId)
    .maybeSingle();
  if (leadError) return { ok: false, error: leadError.message };
  const lead = asRecord(leadData);
  if (!lead.phone) return { ok: false, skipped: "no_phone" };
  const tenantId = optString(lead.tenant_id);
  if (!tenantId) return { ok: false, skipped: "no_tenant" };

  const integrations = await loadTenantWhatsappIntegrations(
    input.admin,
    tenantId,
  );
  const picked = pickCrmWhatsappIntegration(
    optString(lead.active_chat_provider),
    integrations,
  );
  if (!picked || picked.type === "manychat") {
    return { ok: false, skipped: "no_integration" };
  }

  const body: Record<string, unknown> = {
    leadId: lead.id,
    message: input.message,
    phoneNumber: lead.phone,
    tenantId: lead.tenant_id,
    integrationId: picked.id,
  };
  if (picked.user_id) body.senderUserId = picked.user_id;

  const response = await fetch(
    `${input.supabaseUrl}/functions/v1/${functionName(picked.type)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.serviceKey}`,
      },
      body: JSON.stringify(body),
    },
  );
  const result: unknown = await response.json().catch(() => ({}));
  const resultError = asRecord(result).error;
  if (!response.ok || resultError) {
    const errorText =
      typeof resultError === "string"
        ? resultError
        : resultError
          ? JSON.stringify(resultError)
          : "";
    return {
      ok: false,
      error: errorText || `send failed (${response.status})`,
    };
  }
  return { ok: true };
}
