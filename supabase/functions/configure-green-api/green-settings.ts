// The Green API call configure-green-api makes: setSettings with the webhook
// address and the line's new token. Green API docs (SetSettings): "When this
// method is requested, the instance is rebooted. The settings are applied
// within 5 minutes after invoking the setSettings method."
import type { WebhookLine } from "../_shared/green-api-webhook-auth/line.ts";
import { webhookUrlTokenSetting } from "../_shared/green-api-webhook-auth/token.ts";

/** The network and the webhook address, injected so tests see the call. */
export type GreenSettingsDeps = {
  fetch: typeof fetch;
  webhookUrl(): string;
};

/** Sends the line's webhook settings, with the new token, to Green API; true when it saved them. */
export async function saveGreenApiSettings(
  deps: GreenSettingsDeps,
  line: WebhookLine,
  token: string,
): Promise<boolean> {
  const url = `https://api.green-api.com/waInstance${line.instance_id}/setSettings/${line.api_key}`;
  const settings = {
    webhookUrl: deps.webhookUrl(),
    webhookUrlToken: webhookUrlTokenSetting(token),
    outgoingWebhook: "yes",
    outgoingMessageWebhook: "yes",
    outgoingAPIMessageWebhook: "yes",
    incomingWebhook: "yes",
    stateWebhook: "no",
    deviceWebhook: "no",
  };

  try {
    const response = await deps.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const result: unknown = await response.json().catch(() => null);
    const saved =
      response.ok &&
      !!result &&
      typeof result === "object" &&
      "saveSettings" in result &&
      result.saveSettings === true;
    if (!saved) {
      console.error(
        "[configure-green-api] Green API did not save the settings",
        {
          integration_id: line.id,
          status: response.status,
        },
      );
    }
    return saved;
  } catch (e) {
    console.error("[configure-green-api] Green API call failed", {
      integration_id: line.id,
      error: e instanceof Error ? e.message : "unknown",
    });
    return false;
  }
}
