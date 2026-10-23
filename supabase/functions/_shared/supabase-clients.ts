// Typed Supabase clients for edge functions, using the generated schema in
// ./database.types.ts.
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "./database.types.ts";

export type DbClient = SupabaseClient<Database>;

const env = (key: string) => Deno.env.get(key) ?? "";

/** Service-role client: bypasses RLS. Only for trusted, server-side work. */
export function serviceClient(): DbClient {
  return createClient<Database>(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

/** Client that acts as the caller (their JWT), so RLS applies. */
export function userClient(authHeader: string): DbClient {
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}
