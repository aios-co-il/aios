// Response helpers shared by the PBX edge functions.

export const pbxCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...pbxCorsHeaders, "Content-Type": "application/json" },
  });

export const preflight = () => new Response(null, { headers: pbxCorsHeaders });
