import { sendStaffAlert } from "../_shared/staff-alert/send.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { elevenLabsSignatureOk, sharedSecretOk } from "./auth.ts";
import { initiateCall } from "./initiate.ts";
import { leaveMessage } from "./leave-message.ts";
import { handlePostCall } from "./post-call.ts";
import type { SendAlert } from "./recipients.ts";

// Carmen's phone line: the webhooks of the ElevenLabs phone agent (AIO-511).
//   POST …/carmen-phone/initiate            a call starts: who is calling, and the call's prompt
//   POST …/carmen-phone/tools/leave-message the agent passes a message to the team
//   POST …/carmen-phone/post-call           the call ended: transcript and summary
// The first two carry the shared secret header; the last is signed by ElevenLabs.
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  const route = new URL(req.url).pathname.replace(/^.*\/carmen-phone/, "");
  try {
    if (route === "/post-call") {
      return await postCall(req);
    }
    if (
      !sharedSecretOk(
        req.headers.get("x-carmen-phone-secret"),
        Deno.env.get("CARMEN_PHONE_WEBHOOK_SECRET"),
      )
    ) {
      return json({ error: "unauthorized" }, 401);
    }
    if (route === "/initiate") {
      return json(await initiateCall(serviceClient(), await req.json()));
    }
    if (route === "/tools/leave-message") {
      return json(
        await leaveMessage(serviceClient(), staffAlert, await req.json()),
      );
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(`[carmen-phone] ${route} failed`, e);
    return json({ error: "internal error" }, 500);
  }
});

/** The post-call webhook: verified by its signature, answered 200 once recorded. */
async function postCall(req: Request): Promise<Response> {
  const raw = await req.text();
  const signed = await elevenLabsSignatureOk(
    raw,
    req.headers.get("elevenlabs-signature"),
    Deno.env.get("ELEVENLABS_PHONE_WEBHOOK_SECRET"),
  );
  if (!signed) {
    return json({ error: "unauthorized" }, 401);
  }
  await handlePostCall(serviceClient(), staffAlert, JSON.parse(raw));
  return json({ ok: true });
}

/** Sends a team WhatsApp from the org's Carmen line; a failure is logged. */
const staffAlert: SendAlert = async (tenantId, phone, message) => {
  const result = await sendStaffAlert({
    supabase: serviceClient(),
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    tenantId,
    phone,
    message,
  });
  if (!result.sent) {
    console.error("[carmen-phone] team message not sent", {
      tenantId,
      status: result.status,
      error: result.error,
    });
  }
  return result.sent;
};

/** A JSON response. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
