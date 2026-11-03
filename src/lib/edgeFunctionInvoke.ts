import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Surface JSON `{ error }` from Supabase Edge Functions instead of a generic invoke failure. */
export async function invokeEdgeFunction<T = Record<string, unknown>>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    (data as { error?: unknown }).error
  ) {
    throw new Error(String((data as { error: unknown }).error));
  }
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const payload = await ctx.clone().json();
        if (payload?.error) throw new Error(String(payload.error));
        if (payload?.message) throw new Error(String(payload.message));
      } catch (inner) {
        if (inner instanceof Error && inner.message !== error.message)
          throw inner;
      }
    }
    throw new Error(error.message || `קריאה ל-${name} נכשלה`);
  }
  return data as T;
}

/**
 * The reason a failed edge call gives, for a toast. A `FunctionsHttpError` message
 * is always "Edge Function returned a non-2xx status code"; what the function said
 * is in the response body, read here as `message`, then `error`, then `details`.
 */
export async function edgeFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (
    error instanceof FunctionsHttpError &&
    error.context instanceof Response
  ) {
    const body: unknown = await error.context
      .clone()
      .json()
      .catch((bodyError: unknown) => {
        console.error("[edgeFunctionErrorMessage] unreadable body", bodyError);
        return null;
      });
    const fromBody = ["message", "error", "details"]
      .map((key) => bodyField(body, key))
      .find((value) => value);
    if (fromBody) {
      return fromBody;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** A non-empty string field of a JSON body, trimmed. */
function bodyField(body: unknown, key: string): string | undefined {
  const value =
    body && typeof body === "object" ? Reflect.get(body, key) : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
