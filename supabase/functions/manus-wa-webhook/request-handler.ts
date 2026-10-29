import { parseManusBody, type Payload } from "./payload-schema.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wa-gateway-instance, x-wa-gateway-secret, x-webhook-secret, x-manus-secret, x-webhook-signature",
};

/** Keep request decoding importable without starting a server or loading providers. */
export function createWebhookHandler(
  processPayload: (request: Request, payload: Payload) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });
    try {
      const parsed = parseManusBody(await request.json());
      if (parsed.status === "not_object") {
        // ACK so Manus doesn't disable the webhook on a stray non-object body.
        return Response.json(
          { received: true, ignored: "invalid_payload" },
          { headers: corsHeaders },
        );
      }
      return await processPayload(request, parsed.payload);
    } catch (error) {
      console.error("Manus webhook request failed:", error);
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500, headers: corsHeaders },
      );
    }
  };
}
