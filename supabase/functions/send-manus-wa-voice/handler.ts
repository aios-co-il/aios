/**
 * Carmen's reply as a WhatsApp voice note over a Manus line. Only server code
 * that holds this project's service-role key may call it (AIO-246): the
 * function runs with `verify_jwt = false`, so the check lives here.
 *
 * The note leaves only from the line that received the message, named by
 * `integration_id` (AIO-654): with no such active Manus line of the tenant it
 * is not sent, never from another line.
 *
 * POST body: { tenant_id: string, integration_id: string, to: string,
 * text: string, voice?: string }
 */
import { isServiceRoleRequest } from "../_shared/auth/edge-caller-auth.ts";

/** The Manus line a voice note leaves from, with what the gateway needs. */
export type VoiceLine = {
  id: string;
  tenantId: string;
  apiKey: string;
  instanceId: string;
  gatewayUrl: string | null;
};

/** What the handler reads, speaks, stores and sends through; injected so tests use fakes. */
export type VoiceNoteDeps = {
  serviceRoleKey: string;
  /** The tenant's active Manus line with this id, or null. */
  loadLine: (
    tenantId: string,
    integrationId: string,
  ) => Promise<VoiceLine | null>;
  speak: (text: string, voice: string) => Promise<Uint8Array | null>;
  /** Stores the audio and returns the URL the gateway fetches it from. */
  storeAudio: (tenantId: string, audio: Uint8Array) => Promise<string>;
  /** Sends the stored file from the line; false when the gateway rejects it. */
  sendFile: (line: VoiceLine, to: string, fileUrl: string) => Promise<boolean>;
};

type VoiceNoteRequest = {
  tenantId: string;
  integrationId: string;
  to: string;
  text: string;
  voice: string;
};

/** The request handler: caller check, request, line, speech, upload, send. */
export function createVoiceNoteHandler(
  deps: VoiceNoteDeps,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (
      !isServiceRoleRequest(
        req.headers.get("Authorization"),
        deps.serviceRoleKey,
      )
    ) {
      console.warn(
        "[send-manus-wa-voice] refused a caller without the service-role key",
      );
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      const request = await readRequest(req);
      if (!request) {
        console.warn(
          "[send-manus-wa-voice] no voice note: tenant_id, integration_id, to or text missing",
        );
        return json(
          { error: "tenant_id, integration_id, to and text are required" },
          400,
        );
      }

      return await sendVoiceNote(deps, request);
    } catch (error) {
      console.error("[send-manus-wa-voice] failed", error);
      return json({ error: "Internal error" }, 500);
    }
  };
}

/** The request body, or null when a required field is missing or the text has nothing to say. */
async function readRequest(req: Request): Promise<VoiceNoteRequest | null> {
  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { tenant_id, integration_id, to, text, voice } = body as Record<
    string,
    unknown
  >;
  const clean = typeof text === "string" ? cleanForSpeech(text) : "";
  if (
    typeof tenant_id !== "string" ||
    !tenant_id ||
    typeof integration_id !== "string" ||
    !integration_id ||
    typeof to !== "string" ||
    !to ||
    !clean
  ) {
    return null;
  }

  return {
    tenantId: tenant_id,
    integrationId: integration_id,
    to,
    text: clean,
    voice: typeof voice === "string" && voice ? voice : "shimmer",
  };
}

/** Speaks the text, stores the audio and sends it from the line. */
async function sendVoiceNote(
  deps: VoiceNoteDeps,
  request: VoiceNoteRequest,
): Promise<Response> {
  const line = await deps.loadLine(request.tenantId, request.integrationId);
  if (!line) {
    console.error(
      `[send-manus-wa-voice] no voice note: line ${request.integrationId} is not an active Manus line of tenant ${request.tenantId} with a key and an instance`,
    );
    return json({ error: "Line not available" }, 404);
  }

  const audio = await deps.speak(request.text, request.voice);
  if (!audio) {
    return json({ error: "TTS failed" }, 502);
  }

  const fileUrl = await deps.storeAudio(request.tenantId, audio);
  if (!(await deps.sendFile(line, request.to, fileUrl))) {
    return json({ error: "gateway rejected voice send" }, 502);
  }

  return json({ success: true });
}

/** A JSON response. */
function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

/** The text without markdown noise, so text-to-speech reads clean prose. */
function cleanForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>~|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
