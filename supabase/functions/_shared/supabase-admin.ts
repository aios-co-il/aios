// Service-role Supabase client for edge functions. Reads SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (both injected by the platform) and fails loudly
// when either is missing instead of producing a client that 401s later.
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.75.0";

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured",
    );
  }
  return createClient(url, serviceRoleKey);
}
