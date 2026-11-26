/** Fakes for handler.test.ts: a line, every dependency and a request. */
import type { VoiceLine, VoiceNoteDeps } from "./handler.ts";

export const SERVICE_KEY = "service-role-key";
export const TENANT = "11111111-1111-4111-8111-111111111111";
export const LINE_ID = "22222222-2222-4222-8222-222222222222";
export const LINE: VoiceLine = {
  id: LINE_ID,
  tenantId: TENANT,
  ownerUserId: null,
  role: "primary",
  apiKey: "manus-key",
  instanceId: "instance-1",
  gatewayUrl: null,
};

/** Fakes for every dependency, recording each send. */
export function fakeDeps(overrides: Partial<VoiceNoteDeps> = {}) {
  const sent: Array<{ line: VoiceLine; to: string; fileUrl: string }> = [];
  const deps: VoiceNoteDeps = {
    serviceRoleKey: SERVICE_KEY,
    loadLine: () => Promise.resolve(LINE),
    lineVoice: () => Promise.resolve("cedar"),
    speak: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    storeAudio: () => Promise.resolve("https://files/voice.ogg"),
    sendFile: (line, to, fileUrl) => {
      sent.push({ line, to, fileUrl });
      return Promise.resolve(true);
    },
    ...overrides,
  };
  return { deps, sent };
}

/** A POST to the function with this Authorization header and body. */
export function voiceRequest(
  authorization: string | null,
  body: Record<string, unknown> = {
    tenant_id: TENANT,
    integration_id: LINE_ID,
    to: "972501234567@c.us",
    text: "שלום",
  },
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization !== null) {
    headers.set("Authorization", authorization);
  }
  return new Request("https://edge/send-manus-wa-voice", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
