// Loads the tenant's org-level generic PBX integration.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { PbxSettings } from "./types.ts";

export interface PbxIntegration {
  id: string;
  isActive: boolean;
  settings: PbxSettings;
}

export async function loadPbxIntegration(
  sb: SupabaseClient,
  tenantId: string,
): Promise<PbxIntegration | null> {
  const { data } = await sb
    .from("tenant_integrations")
    .select("id, settings, is_active")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "generic_pbx")
    .is("user_id", null)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    isActive: !!data.is_active,
    settings: (data.settings || {}) as PbxSettings,
  };
}
