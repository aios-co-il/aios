import { FunctionsHttpError } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { AgentDatabaseClient } from "../database-contracts.ts";

/** Preserves JSON HTTP error responses while using the existing service-role client. */
export async function invokeExecutorFunction(
  supabase: AgentDatabaseClient,
  name: string,
  body: Record<string, unknown>,
) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error instanceof FunctionsHttpError) {
    return {
      ok: false,
      data: await error.context.json(),
      status: error.context.status,
    };
  }
  if (error) {
    throw error;
  }
  return { ok: true, data, status: 200 };
}
