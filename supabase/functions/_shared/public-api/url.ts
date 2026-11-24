// The project's API address as people and services outside it reach it.
//
// PUBLIC_API_URL is the project's custom domain (https://api.aios.co.il on
// Production); without it the address is SUPABASE_URL, which Supabase always
// sets to the project's own supabase.co address. Use it for every address
// handed to someone outside the project (webhook URLs, MCP URLs, feeds,
// agent callbacks). A call the function makes to its own project keeps using
// SUPABASE_URL: the Staging outbound guard allows only that origin.

/** Reads environment values; Deno.env in production, a fake in tests. */
export interface EnvReader {
  get(key: string): string | undefined;
}

/** The public API base URL without a trailing slash, or "" when neither variable is set. */
export function publicApiUrl(env: EnvReader = Deno.env): string {
  const base = env.get("PUBLIC_API_URL") || env.get("SUPABASE_URL") || "";

  return base.replace(/\/+$/, "");
}

/** The public URL of one of this project's edge functions (`fn` may carry a sub-path). */
export function publicFunctionUrl(
  fn: string,
  env: EnvReader = Deno.env,
): string {
  return `${publicApiUrl(env)}/functions/v1/${fn}`;
}
