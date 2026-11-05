// Sends an image or a document through the Manus WhatsApp gateway, to a
// private chat or a group: report screenshots and documents from the browser
// (multipart, AIO-255) and broadcast images (JSON with a URL).
import { preflight } from "../_shared/telephony/response.ts";
import { liveFileSendDeps } from "./deps.ts";
import { handleFileSend } from "./handler.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return preflight();
  }
  return handleFileSend(req, liveFileSendDeps());
});
