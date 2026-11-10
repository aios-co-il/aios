import { redactSecretsFromText } from "../_shared/openai-billing.ts";
import { errorMessage, readErrorMessage } from "./error-message.ts";
import { providerErrorMessage } from "./tool-contracts-admin.ts";

/** Fetch billing data while preserving HTTP status and redacting error fallbacks. */
export async function openaiAdminGet(
  pathWithQuery: string,
  adminKey: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; json: unknown; error?: string }> {
  try {
    const res = await fetcher(`https://api.openai.com/v1${pathWithQuery}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminKey}`,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const msg = redactSecretsFromText(
        providerErrorMessage(json) ||
          readErrorMessage(json) ||
          text ||
          `HTTP ${res.status}`,
      );
      return { ok: false, status: res.status, json, error: msg };
    }
    return { ok: true, status: res.status, json };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: null,
      error: redactSecretsFromText(errorMessage(e)),
    };
  }
}
