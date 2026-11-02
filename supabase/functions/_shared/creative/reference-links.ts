/**
 * Reference pictures as links the image engines can read. The workshop keeps a user's upload as
 * a link into the private entity-attachments bucket, which answers a plain fetch 400 (Staging,
 * 2 Nov: Carmen could not use an uploaded poster as a reference). Such a link is signed for a few
 * minutes; any other link is kept as it is.
 */
import {
  ENTITY_ATTACHMENTS_BUCKET,
  extractEntityAttachmentPath,
} from "../publishing-images.ts";

/** The part of the Supabase client this module uses: signing a private object. */
export interface SigningClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/** Long enough for the engines to read the picture during one image request. */
const SIGNED_SECONDS = 600;

/**
 * The links to fetch for these references. A private upload of another tenant is left out, so a
 * reference can never read someone else's files; one that cannot be signed is left out and logged.
 */
export async function readableReferenceUrls(
  supabase: SigningClient,
  tenantId: string,
  urls: string[],
): Promise<string[]> {
  const readable = await Promise.all(
    urls.map(async (url) => {
      const path = extractEntityAttachmentPath(url);
      if (!path) {
        return url;
      }
      if (!path.startsWith(`${tenantId}/`)) {
        console.error("[ad-image] reference outside the tenant's files", path);
        return null;
      }
      const { data, error } = await supabase.storage
        .from(ENTITY_ATTACHMENTS_BUCKET)
        .createSignedUrl(path, SIGNED_SECONDS);
      if (error || !data?.signedUrl) {
        console.error("[ad-image] could not sign a reference", path, error);
        return null;
      }
      return data.signedUrl;
    }),
  );
  return readable.filter((url): url is string => url !== null);
}
