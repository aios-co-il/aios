/**
 * Asks the workshop-image function for one picture, so the decoding and upload run in that
 * request's CPU budget instead of the chat's. `missing` means the function is not deployed
 * here and the caller may make the picture itself.
 */

export interface RemoteImageArgs {
  prompt: string;
  aspect_ratio?: string;
  reference_urls?: string[];
  engine?: string;
}

export type RemoteImage =
  { image_url: string } | { error: string; missing?: boolean };

/** A picture can take a minute or two; the chat's own time limit is longer. */
const TIMEOUT_MS = 170_000;

export async function remoteAdImage(
  baseUrl: string,
  serviceKey: string,
  tenantId: string,
  args: RemoteImageArgs,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteImage> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/functions/v1/workshop-image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenant_id: tenantId, ...args }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return {
      error: `יצירת התמונה לא הגיבה: ${error instanceof Error ? error.message : error}`,
    };
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return { error: "workshop-image is not deployed", missing: true };
  }
  const data = await response.json().catch(() => null);
  if (data && typeof data.image_url === "string" && data.image_url)
    return { image_url: data.image_url };
  return {
    error:
      typeof data?.error === "string" && data.error
        ? data.error
        : `יצירת התמונה נכשלה (${response.status})`,
  };
}
