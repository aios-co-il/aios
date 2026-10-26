import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

/**
 * Client for queries the generated schema (database.types.ts) cannot describe:
 * tables or columns that are missing from it. A DbClient is assignable to it.
 */
export type UntypedSchemaClient = SupabaseClient;
