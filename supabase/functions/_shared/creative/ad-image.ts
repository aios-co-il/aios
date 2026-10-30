/**
 * One ad or scene picture: the tenant's OpenRouter brain first (with the reference pictures),
 * then the connected image engines, and OpenRouter again from the prompt alone before giving
 * up; the result is uploaded to the public social-media bucket.
 * Shared by Carmen's generate_ad_image tool and the workshop-image function, which runs it in
 * its own request so a film's pictures do not use up the chat request's CPU time.
 */
import { imageProvidersFor } from "../workshop/capabilities.ts";
import {
  loadReferences,
  type ImageProvider,
} from "../workshop/image-providers.ts";
import { tenantImageKeys } from "./tenant-image-keys.ts";
import { publicFetchAsFetch } from "../public-fetch.ts";
import { tenantOpenRouterKey } from "./openrouterImage.ts";
import { pictureFromEngines } from "./picture-engines.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface AdImageArgs {
  prompt?: unknown;
  aspect_ratio?: unknown;
  reference_urls?: unknown;
  engine?: unknown;
}

export type AdImageResult =
  | {
      success: true;
      image_url: string;
      provider: string;
      references_used: number;
      message: string;
    }
  | { success: false; error: string; suggestion?: string };

const ENGINES: string[] = ["google", "elevenlabs", "higgsfield", "openai"];
export async function makeAdImage(
  supabase: Db,
  tenantId: string,
  args: AdImageArgs,
): Promise<AdImageResult> {
  const { connected, keys } = await tenantImageKeys(supabase, tenantId);
  const referenceUrls = (
    Array.isArray(args.reference_urls) ? args.reference_urls : []
  )
    .filter((url: unknown): url is string => typeof url === "string")
    .slice(0, 5);
  const openRouterKey = await tenantOpenRouterKey(supabase, tenantId).catch(
    () => "",
  );
  if (imageProvidersFor(connected).length === 0 && !openRouterKey)
    return {
      success: false,
      error:
        "אין מפתח ליצירת תמונות. מספיק מוח OpenRouter מחובר, או אחד מ-OpenAI, Google, ElevenLabs או Higgsfield בהגדרות מודלי AI.",
      suggestion: "פנה למנהל המערכת להגדרת המפתח.",
    };
  const loadedReferences = await loadReferences(
    referenceUrls,
    publicFetchAsFetch,
  );
  if (referenceUrls.length > 0 && loadedReferences.references.length === 0) {
    return {
      success: false,
      error:
        "לא הצלחתי לקרוא את תמונות הרפרנס (הקישור פג או לא נגיש). בקשי מהמשתמש לצרף אותן שוב.",
    };
  }
  let made: { bytes: Uint8Array; mime: string; provider: string };
  try {
    made = await pictureFromEngines({
      openRouterKey,
      keys,
      otherEngines: imageProvidersFor(connected).length > 0,
      prompt: String(args.prompt ?? ""),
      aspectRatio: args.aspect_ratio,
      engine: ENGINES.includes(String(args.engine))
        ? (args.engine as ImageProvider)
        : undefined,
      references: loadedReferences.references,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "יצירת התמונה נכשלה",
    };
  }
  const ext = made.mime.includes("jpeg") ? "jpg" : "png";
  const fileName = `agent-generated/${tenantId}/${crypto.randomUUID()}.${ext}`;
  await supabase.storage
    .createBucket("social-media", { public: true })
    .catch(() => {});
  const { error: uploadError } = await supabase.storage
    .from("social-media")
    .upload(fileName, made.bytes, { contentType: made.mime, upsert: true });
  if (uploadError)
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  const { data: urlData } = supabase.storage
    .from("social-media")
    .getPublicUrl(fileName);
  return {
    success: true,
    image_url: urlData.publicUrl,
    provider: made.provider,
    references_used: loadedReferences.references.length,
    message: "התמונה נוצרה בהצלחה. השתמש בה ביצירת הפוסט.",
  };
}
