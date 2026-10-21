// Loads the tenant's PBX settings (config plus secrets) for the edge functions.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { PbxSettings } from "./types.ts";

export type PbxIntegration = {
  isActive: boolean;
  settings: PbxSettings;
};

export async function loadPbxIntegration(
  sb: SupabaseClient,
  tenantId: string,
): Promise<PbxIntegration | null> {
  const { data } = await sb
    .from("pbx_settings")
    .select("is_active, config, inbound_secret, outbound_auth_value")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    isActive: data.is_active,
    settings: {
      ...(data.config as PbxSettings),
      inbound_secret: data.inbound_secret,
      outbound_auth_value: data.outbound_auth_value ?? undefined,
    },
  };
}
