import type { Json } from "../_shared/database.types.ts";

type Payload = Record<string, Json>;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wa-gateway-instance, x-wa-gateway-secret, x-webhook-secret, x-manus-secret, x-webhook-signature",
};

function isPayload(value: unknown): value is Payload {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Keep request decoding importable without starting a server or loading providers. */
export function createWebhookHandler(
  processPayload: (request: Request, payload: Payload) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });
    try {
      const payload: unknown = await request.json();
      if (!isPayload(payload))
        return Response.json(
          { error: "Invalid payload" },
          { status: 400, headers: corsHeaders },
        );
      return await processPayload(request, payload);
    } catch (error) {
      console.error("Manus webhook request failed:", error);
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500, headers: corsHeaders },
      );
    }
  };
}
