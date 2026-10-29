import type { Database } from "../_shared/database.types.ts";
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

export type AgentDatabaseClient = ReturnType<typeof createClient<Database>>;

export type AgentRow<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Row"];
