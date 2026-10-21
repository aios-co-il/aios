// Resolves the signed-in user from the request's Authorization header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

export async function getAuthedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const { data, error } = await createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  ).auth.getUser();
  return error || !data.user ? null : data.user.id;
}
