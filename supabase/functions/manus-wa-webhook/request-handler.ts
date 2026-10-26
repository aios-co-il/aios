import type { Json } from "../_shared/database.types.ts";
import { type JsonObject, pickJsonObject } from "./payload-types.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wa-gateway-instance, x-wa-gateway-secret, x-webhook-secret, x-manus-secret, x-webhook-signature",
};

export function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Keep request decoding importable without starting a server or loading providers. */
export function createWebhookHandler(
  processPayload: (request: Request, payload: JsonObject) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });
    try {
      const body: Json = await request.json();
      const payload = pickJsonObject(body);
      // 200-ack (not 4xx) so Manus does not disable the webhook.
      if (!payload) return ok({ received: true, ignored: "invalid_payload" });
      return await processPayload(request, payload);
    } catch (error) {
      console.error("Manus webhook request failed:", error);
      return ok(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  };
}
