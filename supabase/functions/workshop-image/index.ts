/**
 * Makes one workshop picture in its own request. A film's scene pictures used to be made inside
 * Carmen's chat request, and decoding and uploading several pictures there ran past the edge
 * runtime's CPU limit, which killed the chat mid-turn. run-ai-agent calls this with the service
 * role key after it has checked the caller's access to the tenant.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { makeAdImage } from "../_shared/creative/ad-image.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!serviceKey || token !== serviceKey)
    return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
  if (!tenantId || typeof body?.prompt !== "string" || !body.prompt.trim())
    return json(
      { success: false, error: "tenant_id and prompt are required" },
      400,
    );
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });
  try {
    return json(
      await makeAdImage(supabase, tenantId, {
        prompt: body.prompt,
        aspect_ratio: body.aspect_ratio,
        reference_urls: body.reference_urls,
        engine: body.engine,
      }),
    );
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "יצירת התמונה נכשלה",
      },
      500,
    );
  }
});
