// Fixed at build time for one environment (build/environment.ts, set in vite.config.ts);
// a missing value stops the build. The anon (publishable) key is safe to embed in a
// client: all access is enforced by RLS with the signed-in user's JWT.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN;

/** Every address of the environment's Supabase project: pages Carmen never reads. */
export const SUPABASE_ORIGINS = import.meta.env.VITE_SUPABASE_ORIGINS;
