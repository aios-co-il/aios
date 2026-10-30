/**
 * Images through OpenRouter's Image API (POST /api/v1/images), with the key of
 * the tenant's OpenRouter brain (Carmen settings → מוחות, חיבורים ומפתחות AI).
 */
import type { SecretClient } from "../carmen/brain-connections/overrides.ts";
import { connectionSecret } from "../carmen/brain-connections/overrides.ts";
import { toBase64 } from "../workshop/image-providers.ts";

export const OPENROUTER_IMAGE_MODEL = "google/gemini-3.1-flash-image";
const IMAGES_URL = "https://openrouter.ai/api/v1/images";

/**
 * The first connected OpenRouter brain in this tenant (its row id), or null. Reads no
 * secret, so it also answers "does this tenant have OpenRouter?" (workshop video engine).
 */
export async function tenantOpenRouterConnectionId(
  sb: SecretClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("carmen_brain_connections")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "chat_model")
    .eq("provider_preset", "openrouter")
    .not("key_last4", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

/** The first connected OpenRouter brain's key in this tenant, or "". */
export async function tenantOpenRouterKey(
  sb: SecretClient,
  tenantId: string,
): Promise<string> {
  const id = await tenantOpenRouterConnectionId(sb, tenantId);
  if (!id) return "";
  return await connectionSecret(sb, id);
}

/**
 * One image; throws with the provider's status on failure (502 is not billed). Reference
 * pictures go in `input_references` as data URLs, which Gemini image models accept.
 */
export async function generateOpenRouterImage(args: {
  apiKey: string;
  prompt: string;
  aspectRatio?: string;
  model?: string;
  references?: { bytes: Uint8Array; mime: string }[];
  fetchImpl?: typeof fetch;
}): Promise<{
  b64: string;
  mediaType: string;
  model: string;
  usd: number | null;
}> {
  const model = args.model || OPENROUTER_IMAGE_MODEL;
  const res = await (args.fetchImpl ?? fetch)(IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: args.prompt,
      n: 1,
      aspect_ratio: args.aspectRatio || "1:1",
      output_format: "png",
      ...(args.references?.length
        ? {
            input_references: args.references.map((reference) => ({
              type: "image_url",
              image_url: {
                url: `data:${reference.mime};base64,${toBase64(reference.bytes)}`,
              },
            })),
          }
        : {}),
    }),
    redirect: "manual",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      `OpenRouter image ${res.status}: ${JSON.stringify(data?.error ?? data).slice(0, 200)}`,
    );
  const image = data?.data?.[0];
  if (!image?.b64_json) throw new Error("OpenRouter returned no image");
  return {
    b64: image.b64_json,
    mediaType: image.media_type || "image/png",
    model,
    usd: typeof data?.usage?.cost === "number" ? data.usage.cost : null,
  };
}
