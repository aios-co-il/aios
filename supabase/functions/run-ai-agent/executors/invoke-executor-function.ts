import {
  FunctionsHttpError,
  FunctionsRelayError,
} from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { DbClient } from "../../_shared/supabase-clients.ts";

/** Preserves each caller's JSON or raw-text HTTP errors over the service-role client. */
export async function invokeExecutorFunction(
  supabase: DbClient,
  name: string,
  body: Record<string, unknown>,
  errorFormat: "json" | "text" = "json",
) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (
    (error instanceof FunctionsHttpError ||
      error instanceof FunctionsRelayError) &&
    error.context instanceof Response
  ) {
    return {
      ok: false,
      data: await error.context[errorFormat](),
      status: error.context.status,
    };
  }
  if (error) {
    throw error;
  }
  return {
    ok: true,
    data:
      typeof data === "string" && errorFormat === "json"
        ? JSON.parse(data)
        : data,
    status: 200,
  };
}
