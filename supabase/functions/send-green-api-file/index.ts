import {
  resolveGreenApiChatTarget,
  withTimeout,
  GREEN_API_UPSTREAM_TIMEOUT_MS,
  CHAT_MESSAGES_INSERT_TIMEOUT_MS,
} from "../_shared/send-green-api-file-chat-resolve.mjs";
import { checkWhatsAppSend } from "../_shared/integration-guard.ts";
import {
  lineSetting,
  lineStore,
} from "../_shared/report-sender/line-access.ts";
import { sendKindColumns } from "../_shared/client-card/send-kind.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { internalError } from "../_shared/telephony/response.ts";
import { prepareGreenFileSend } from "./prepare.ts";
import { legacyGreenLine } from "./sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function greenApiAbortSignal() {
  try {
    if (
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
    ) {
      return AbortSignal.timeout(GREEN_API_UPSTREAM_TIMEOUT_MS);
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

async function fetchGreenApiUpload(
  endpoint: string,
  uploadFormData: FormData,
): Promise<Response> {
  const signal = greenApiAbortSignal();
  try {
    if (signal) {
      return await fetch(endpoint, {
        method: "POST",
        body: uploadFormData,
        signal,
      });
    }
    // Fallback when AbortSignal.timeout is unavailable — still bounds the await
    return await withTimeout(
      fetch(endpoint, { method: "POST", body: uploadFormData }),
      GREEN_API_UPSTREAM_TIMEOUT_MS,
      "green_api_upstream",
    );
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (
      name === "TimeoutError" ||
      name === "AbortError" ||
      msg.includes("timeout")
    ) {
      throw new Error(
        `Green API timeout after ${GREEN_API_UPSTREAM_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseClient = userClient(authHeader);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const rawFile = formData.get("file") as File | null;
    const clientId = formData.get("clientId") as string | null;
    const leadId = formData.get("leadId") as string | null;
    const groupId = formData.get("groupId") as string | null;
    const phoneNumber = formData.get("phoneNumber") as string | null;
    const tenantId = formData.get("tenantId") as string | null;
    const caption = (formData.get("caption") as string) || "";
    const fileType = (formData.get("fileType") as string) || "document";
    // Optional explicit sender instance chosen by the caller (report/dashboard sender picker).
    const chosenIntegrationId = formData.get("integrationId") as string | null;
    // This function only serves signed-in users, so an unnamed kind is "chat".
    const sendColumns = sendKindColumns({
      sendKind: formData.get("sendKind"),
      sendRef: formData.get("sendRef"),
      isServiceRole: false,
    });

    if (!rawFile) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buffer the file fully into memory before forwarding.
    // Streaming a File from incoming FormData directly into an outgoing FormData
    // can result in an empty body when the request is re-encoded — Green API then
    // returns: {"error":"file should not be empty"}.
    const fileBytes = new Uint8Array(await rawFile.arrayBuffer());
    const safeFileName =
      rawFile.name && rawFile.name.length > 0 ? rawFile.name : "file";
    const safeMimeType =
      rawFile.type && rawFile.type.length > 0
        ? rawFile.type
        : "application/octet-stream";
    const file = new File([fileBytes], safeFileName, { type: safeMimeType });

    console.log("[send-green-api-file] received file", {
      name: safeFileName,
      type: safeMimeType,
      size: fileBytes.byteLength,
    });

    if (fileBytes.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: "File is empty (0 bytes)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    // Determine tenant_id
    let resolvedTenantId = tenantId;
    let groupChatId: string | undefined;

    if (!resolvedTenantId && clientId) {
      const { data: client } = await supabaseClient
        .from("clients")
        .select("tenant_id")
        .eq("id", clientId)
        .single();
      resolvedTenantId = client?.tenant_id ?? null;
    } else if (!resolvedTenantId && leadId) {
      const { data: lead } = await supabaseClient
        .from("leads")
        .select("tenant_id")
        .eq("id", leadId)
        .single();
      resolvedTenantId = lead?.tenant_id ?? null;
    }

    // Always resolve group_chat_id when groupId is present (do not nest under client/lead else-if).
    if (groupId) {
      const { data: group } = await supabaseClient
        .from("whatsapp_groups")
        .select("tenant_id, group_chat_id")
        .eq("id", groupId)
        .maybeSingle();
      resolvedTenantId = resolvedTenantId || group?.tenant_id || null;
      groupChatId = group?.group_chat_id || undefined;
    }

    if (!resolvedTenantId) {
      const { data: activeTenant } = await supabaseClient
        .from("user_active_tenant")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();
      resolvedTenantId = activeTenant?.tenant_id ?? null;
    }

    if (!resolvedTenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const send = await prepareGreenFileSend(
      {
        store: lineStore(serviceClient()),
        legacyLine: (tenantId, userId) =>
          legacyGreenLine(supabaseClient, tenantId, userId),
        guard: checkWhatsAppSend,
      },
      {
        tenantId: resolvedTenantId,
        userId: user.id,
        integrationId: chosenIntegrationId,
        groupId,
        groupChatId,
        phoneNumber,
      },
    );
    if ("refusal" in send) {
      return new Response(JSON.stringify(send.refusal.body), {
        status: send.refusal.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { line, chatId, usedGroupChat } = send;
    const instanceId = lineSetting(line.settings, "instance_id");
    const apiToken = line.api_key;

    // Determine API endpoint based on file type
    let endpoint: string;
    let body: any;

    const mimeType = file.type;
    const fileName = file.name;
    const uploadBlob = new Blob([fileBytes], { type: mimeType });

    if (fileType === "voice" || mimeType.startsWith("audio/")) {
      endpoint = `https://api.green-api.com/waInstance${instanceId}/sendFileByUpload/${apiToken}`;

      // For voice messages, use sendFileByUpload with audio file
      const uploadFormData = new FormData();
      uploadFormData.append("chatId", chatId);
      uploadFormData.append("file", uploadBlob, fileName);
      if (caption) uploadFormData.append("caption", caption);

      const response = await fetchGreenApiUpload(endpoint, uploadFormData);

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(`Green API error: ${JSON.stringify(responseData)}`);
      }

      // Save to database (bounded — do not block success if insert hangs)
      try {
        await withTimeout(
          supabaseClient.from("chat_messages").insert({
            client_id: clientId || null,
            lead_id: leadId || null,
            group_id: groupId || null,
            tenant_id: resolvedTenantId,
            connection_user_id: user.id,
            integration_id: line.id,
            message_text: `[הודעה קולית]${caption ? ": " + caption : ""}`,
            direction: "outbound",
            channel: "whatsapp",
            provider: "green_api",
            sent_by_user_id: user.id,
            raw_provider_data: responseData,
            sender_phone: !usedGroupChat ? chatId.replace("@c.us", "") : null,
            ...sendColumns,
          }),
          CHAT_MESSAGES_INSERT_TIMEOUT_MS,
          "chat_messages_insert",
        );
      } catch (insertErr) {
        console.warn(
          "[send-green-api-file] chat_messages insert skipped after voice send",
          insertErr,
        );
      }

      return new Response(
        JSON.stringify({ success: true, messageId: responseData.idMessage }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // For images, videos, documents
    if (mimeType.startsWith("image/")) {
      endpoint = `https://api.green-api.com/waInstance${instanceId}/sendFileByUpload/${apiToken}`;
    } else if (mimeType.startsWith("video/")) {
      endpoint = `https://api.green-api.com/waInstance${instanceId}/sendFileByUpload/${apiToken}`;
    } else {
      endpoint = `https://api.green-api.com/waInstance${instanceId}/sendFileByUpload/${apiToken}`;
    }

    // Use FormData for file upload
    const uploadFormData = new FormData();
    uploadFormData.append("chatId", chatId);
    uploadFormData.append("file", uploadBlob, fileName);
    if (caption) uploadFormData.append("caption", caption);

    const response = await fetchGreenApiUpload(endpoint, uploadFormData);

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(`Green API error: ${JSON.stringify(responseData)}`);
    }

    // Determine message text based on file type
    let messageText = "";
    if (mimeType.startsWith("image/")) {
      messageText = caption || "[תמונה]";
    } else if (mimeType.startsWith("video/")) {
      messageText = caption || "[וידאו]";
    } else {
      messageText = `[מסמך: ${fileName}]${caption ? " - " + caption : ""}`;
    }

    // Save to database (bounded — WA already sent; do not hang the client)
    try {
      await withTimeout(
        supabaseClient.from("chat_messages").insert({
          client_id: clientId || null,
          lead_id: leadId || null,
          group_id: groupId || null,
          tenant_id: resolvedTenantId,
          connection_user_id: user.id,
          integration_id: line.id,
          message_text: messageText,
          direction: "outbound",
          channel: "whatsapp",
          provider: "green_api",
          sent_by_user_id: user.id,
          raw_provider_data: responseData,
          sender_phone: !usedGroupChat ? chatId.replace("@c.us", "") : null,
          ...sendColumns,
        }),
        CHAT_MESSAGES_INSERT_TIMEOUT_MS,
        "chat_messages_insert",
      );
    } catch (insertErr) {
      console.warn(
        "[send-green-api-file] chat_messages insert skipped after file send",
        insertErr,
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: responseData.idMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    // Database and upstream text stays in the log, never in the response.
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        error.message.includes("timeout"));
    if (!isTimeout) {
      return internalError("send-green-api-file", error);
    }
    console.error("❌ Timeout in send-green-api-file:", error);
    return new Response(
      JSON.stringify({ error: "Green API timeout", code: "timeout" }),
      {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
