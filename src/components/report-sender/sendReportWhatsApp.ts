import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { SendKind } from "../../../supabase/functions/_shared/client-card/send-kind.ts";
import { reportSenderFunction } from "../../../supabase/functions/_shared/report-sender/routes.ts";
import {
  pickErrorKey,
  REPORT_SENDER_MESSAGES,
  reportSenderMessage,
} from "./reportSenderMessages";
import type { ReportSenderChoicePick } from "./useReportSenderChoice";

/** The kinds a browser report send may stamp (client card, AIO-242). */
export type ReportSendKind = Extract<
  SendKind,
  "report" | "dashboard_share" | "meeting_summary"
>;

type ReportSendBase = {
  tenantId: string;
  /** The resolved line, from useReportSenderChoice. */
  pick: ReportSenderChoicePick;
  /** whatsapp_groups.id; a phone may come along as the fallback. */
  groupId?: string | null;
  phoneNumber?: string | null;
  clientId?: string | null;
  sendKind: ReportSendKind;
  sendRef: string;
  timeoutMs?: number;
};

type TextSend = ReportSendBase & { text: string };

type FileSend = ReportSendBase & {
  file: Blob;
  fileName: string;
  fileType: "image" | "document";
  caption?: string;
};

export type ReportWhatsAppSend = TextSend | FileSend;

export type ReportWhatsAppResult = {
  deliveredAs: "media" | "text" | "text_fallback";
};

/**
 * Sends the WhatsApp part of a report, dashboard or meeting summary from the
 * chosen line (Green API or Manus), always naming it so the server never
 * picks another phone. Throws an Error with a Hebrew message when nothing
 * was confirmed sent; a timeout says to check WhatsApp, never to resend.
 */
export async function sendReportWhatsApp(
  input: ReportWhatsAppSend,
): Promise<ReportWhatsAppResult> {
  const { pick } = input;
  if ("error" in pick) {
    throw new Error(REPORT_SENDER_MESSAGES[pickErrorKey(pick)]);
  }
  const isFile = "file" in input;
  const { data, error } = await supabase.functions.invoke(
    reportSenderFunction(pick.type, isFile ? "file" : "text"),
    {
      body: isFile
        ? fileBody(input, pick.sender.id)
        : textBody(input, pick.sender.id),
      timeout: input.timeoutMs,
    },
  );
  if (error) {
    throw new Error(await sendErrorMessage(error));
  }
  if (field(data, "delivered") === "unknown") {
    throw new Error(REPORT_SENDER_MESSAGES.delivery_unknown);
  }
  if (!isFile) {
    return { deliveredAs: "text" };
  }
  return field(data, "delivered_as") === "text_fallback"
    ? { deliveredAs: "text_fallback" }
    : { deliveredAs: "media" };
}

/** Multipart body for send-green-api-file / send-manus-wa-file. */
function fileBody(input: FileSend, integrationId: string): FormData {
  const form = new FormData();
  form.append("file", input.file, input.fileName);
  form.append("fileType", input.fileType);
  form.append("tenantId", input.tenantId);
  form.append("integrationId", integrationId);
  // Manus: a group that refuses the media still gets the caption (its link).
  form.append("captionFallback", "true");
  for (const [key, value] of Object.entries({
    caption: input.caption,
    groupId: input.groupId,
    phoneNumber: input.phoneNumber,
    clientId: input.clientId,
  })) {
    if (value) {
      form.append(key, value);
    }
  }
  form.append("sendKind", input.sendKind);
  form.append("sendRef", input.sendRef);
  return form;
}

/** JSON body for send-green-api-message / send-manus-wa-message. */
function textBody(input: TextSend, integrationId: string) {
  return {
    tenantId: input.tenantId,
    integrationId,
    message: input.text,
    ...(input.groupId ? { groupId: input.groupId } : {}),
    ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
    sendKind: input.sendKind,
    sendRef: input.sendRef,
  };
}

/** A Hebrew message for a failed call: the server's code, a timeout, or its text. */
async function sendErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await responseJson(error.context);
    const text = field(body, "error");
    return (
      reportSenderMessage(field(body, "code")) ??
      reportSenderMessage(text) ??
      (typeof text === "string" && text
        ? text
        : REPORT_SENDER_MESSAGES.send_failed)
    );
  }
  if (error instanceof FunctionsFetchError) {
    const name = field(error.context, "name");
    return name === "AbortError" || name === "TimeoutError"
      ? REPORT_SENDER_MESSAGES.timeout
      : REPORT_SENDER_MESSAGES.send_failed;
  }
  return error instanceof Error && error.message
    ? error.message
    : REPORT_SENDER_MESSAGES.send_failed;
}

/** The JSON body of an error response, or null. */
async function responseJson(context: unknown): Promise<unknown> {
  if (!(context instanceof Response)) {
    return null;
  }
  return context.json().catch(() => null);
}

/** One property of an unknown value, if it is an object. */
function field(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? Reflect.get(value, key)
    : undefined;
}
