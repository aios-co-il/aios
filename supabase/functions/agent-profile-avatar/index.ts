import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveOpenAIKey } from "../_shared/ai.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers, status });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return reply({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return reply({ error: "Unauthorized" }, 401);
    const { tenantId, agentId, prompt, imageData } = await req.json();
    if (typeof tenantId !== "string" || typeof agentId !== "string")
      return reply({ error: "Missing organization or agent" }, 400);
    // Resolve the exact agent through the caller's RLS before using privileged storage.
    const { data: agent, error } = await userClient
      .from("ai_agents")
      .select("id")
      .eq("id", agentId)
      .eq("tenant_id", tenantId)
      .single();
    if (error || !agent)
      return reply(
        { error: "Agent is not accessible in this organization" },
        403,
      );
    let bytes: Uint8Array;
    let type: string;
    if (imageData !== undefined) {
      if (typeof imageData !== "string" || imageData.length > 7_000_000)
        return reply({ error: "Image too large" }, 400);
      const match =
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
          imageData,
        );
      if (!match) return reply({ error: "Use PNG, JPG or WebP" }, 400);
      type = match[1];
      bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      if (bytes.length > 5 * 1024 * 1024)
        return reply({ error: "Maximum image size is 5MB" }, 400);
      const valid =
        type === "png"
          ? bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71
          : type === "jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (!valid) return reply({ error: "Invalid image file" }, 400);
    } else {
      if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000)
        return reply(
          { error: "Describe the character (up to 2000 characters)" },
          400,
        );
      const key = await resolveOpenAIKey();
      if (!key) return reply({ error: "מנוע יצירת התמונות אינו מוגדר" }, 503);
      const response = await fetch(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-image-2.5-sunburst",
            n: 1,
            size: "1024x1024",
            quality: "medium",
            background: "transparent",
            output_format: "png",
            prompt: `Create a premium dimensional assistant profile character. Transparent background, head and upper torso, centered, front facing, hair/head entirely visible with top margin. Sculptural depth, soft directional studio light, natural shadow on character, crisp silhouette. No circle, frame, text or background. The head should be suitable for compositing above a circular UI frame. User character description: ${prompt.trim()}`,
          }),
        },
      );
      if (!response.ok)
        return reply(
          {
            error:
              response.status === 429
                ? "מנוע התמונות עמוס, נסה שוב בהמשך"
                : "יצירת התמונה נכשלה",
          },
          response.status === 429 ? 429 : 502,
        );
      const result = await response.json();
      const b64 = result.data?.[0]?.b64_json;
      if (typeof b64 !== "string")
        return reply({ error: "No image returned" }, 502);
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      type = "png";
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const path = `${tenantId}/agent-avatars/${agentId}/${crypto.randomUUID()}.${type}`;
    const { error: uploadError } = await admin.storage
      .from("entity-attachments")
      .upload(path, bytes, { contentType: `image/${type}`, upsert: false });
    if (uploadError) return reply({ error: "שמירת התמונה נכשלה" }, 500);
    const { data, error: signError } = await userClient.storage
      .from("entity-attachments")
      .createSignedUrl(path, 3600);
    if (signError || !data)
      return reply({ error: "לא ניתן להציג את התמונה" }, 403);
    return reply({ avatar_url: data.signedUrl, avatar_path: path });
  } catch (error) {
    console.error(
      "agent-profile-avatar",
      error instanceof Error ? error.message : "Unknown error",
    );
    return reply({ error: "לא ניתן לעבד את התמונה" }, 500);
  }
});
