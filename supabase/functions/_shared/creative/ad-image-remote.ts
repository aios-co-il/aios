import {
  FunctionsHttpError,
  FunctionsRelayError,
} from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { DbClient } from "../supabase-clients.ts";

/**
 * Asks the workshop-image function for one picture, so the decoding and upload run in that
 * request's CPU budget instead of the chat's. `missing` means the function is not deployed
 * here and the caller may make the picture itself.
 */

export interface RemoteImageArgs {
  prompt: string;
  aspect_ratio?: string;
  reference_urls?: Array<string>;
  engine?: string;
}

export type RemoteImage =
  { image_url: string } | { error: string; missing?: boolean };

/** A picture can take a minute or two; the chat's own time limit is longer. */
const TIMEOUT_MS = 170_000;

export async function remoteAdImage(
  supabase: DbClient,
  tenantId: string,
  args: RemoteImageArgs,
): Promise<RemoteImage> {
  let data: unknown;
  let status = 200;
  try {
    const invoked = await supabase.functions.invoke("workshop-image", {
      body: { tenant_id: tenantId, ...args },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = invoked.response?.status ?? 200;
    if (invoked.error) {
      const error = invoked.error;
      if (
        (error instanceof FunctionsHttpError ||
          error instanceof FunctionsRelayError) &&
        error.context instanceof Response
      ) {
        status = error.context.status;
        if (status === 404) {
          await error.context.body?.cancel();
          return { error: "workshop-image is not deployed", missing: true };
        }
        data = await error.context.json().catch(() => null);
      } else if (error instanceof SyntaxError) {
        data = null;
      } else {
        // The SDK wraps fetch failures; retain the underlying transport error text.
        throw error.context instanceof Error ? error.context : error;
      }
    } else {
      data = invoked.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          data = null;
        }
      }
    }
  } catch (error) {
    return {
      error: `יצירת התמונה לא הגיבה: ${error instanceof Error ? error.message : error}`,
    };
  }
  const result = typeof data === "object" && data !== null ? data : {};
  if (
    "image_url" in result &&
    typeof result.image_url === "string" &&
    result.image_url
  ) {
    return { image_url: result.image_url };
  }
  return {
    error:
      "error" in result && typeof result.error === "string" && result.error
        ? result.error
        : `יצירת התמונה נכשלה (${status})`,
  };
}
