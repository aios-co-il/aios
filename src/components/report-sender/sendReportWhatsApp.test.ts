import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportSender } from "../../../supabase/functions/_shared/report-sender/fixture.ts";
import { sendReportWhatsApp } from "./sendReportWhatsApp";
import type { ReportSenderChoicePick } from "./useReportSenderChoice";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

const carmen: ReportSenderChoicePick = {
  sender: reportSender("carmen", { integration_type: "manus_wa" }),
  type: "manus_wa",
  source: "only_sender",
};
const green: ReportSenderChoicePick = {
  sender: reportSender("green"),
  type: "green_api",
  source: "own_line",
};

const screenshot = {
  tenantId: "t1",
  file: new Blob(["png"], { type: "image/png" }),
  fileName: "report.png",
  fileType: "image" as const,
  caption: "📊 https://aios.co.il/shared/table/x",
  groupId: "group-1",
  clientId: "client-1",
  sendKind: "report" as const,
  sendRef: "table-1",
};

/** The FormData body of the nth invoke call. */
function formOf(call: number): FormData {
  const body = invoke.mock.calls[call][1].body;
  if (!(body instanceof FormData)) {
    throw new Error("expected a multipart body");
  }
  return body;
}

beforeEach(() => {
  invoke.mockResolvedValue({ data: { success: true }, error: null });
});

describe("sendReportWhatsApp", () => {
  it("sends a Manus file to the Manus file function, naming the line", async () => {
    await expect(
      sendReportWhatsApp({ ...screenshot, pick: carmen }),
    ).resolves.toEqual({
      deliveredAs: "media",
    });
    expect(invoke.mock.calls[0][0]).toBe("send-manus-wa-file");
    const form = formOf(0);
    expect(form.get("integrationId")).toBe("carmen");
    expect(form.get("groupId")).toBe("group-1");
    expect(form.get("captionFallback")).toBe("true");
    // The client card logs the report once, from report_deliveries.
    expect(form.get("sendKind")).toBe("report");
    expect(form.get("sendRef")).toBe("table-1");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("sends a Green API file to the Green API file function", async () => {
    await sendReportWhatsApp({
      ...screenshot,
      pick: green,
      groupId: null,
      phoneNumber: "0501234567",
    });
    expect(invoke.mock.calls[0][0]).toBe("send-green-api-file");
    expect(formOf(0).get("integrationId")).toBe("green");
    expect(formOf(0).get("phoneNumber")).toBe("0501234567");
    expect(formOf(0).has("groupId")).toBe(false);
  });

  it("sends text as JSON with the line, kind and reference", async () => {
    await sendReportWhatsApp({
      tenantId: "t1",
      pick: carmen,
      text: "סיכום פגישה",
      phoneNumber: "0501234567",
      sendKind: "meeting_summary",
      sendRef: "rec-1",
    });
    expect(invoke).toHaveBeenCalledWith("send-manus-wa-message", {
      body: {
        tenantId: "t1",
        integrationId: "carmen",
        message: "סיכום פגישה",
        phoneNumber: "0501234567",
        sendKind: "meeting_summary",
        sendRef: "rec-1",
      },
      timeout: undefined,
    });
  });

  it("reports a caption sent instead of a refused group image", async () => {
    invoke.mockResolvedValue({
      data: { success: true, delivered_as: "text_fallback" },
      error: null,
    });
    await expect(
      sendReportWhatsApp({ ...screenshot, pick: carmen }),
    ).resolves.toEqual({
      deliveredAs: "text_fallback",
    });
  });

  it("never calls the server without a line", async () => {
    await expect(
      sendReportWhatsApp({
        ...screenshot,
        pick: { error: "no_report_sender" },
      }),
    ).rejects.toThrow("אין טלפון וואטסאפ מחובר לשליחת דוחות");
    await expect(
      sendReportWhatsApp({ ...screenshot, pick: { error: "choose_sender" } }),
    ).rejects.toThrow("בחרו מאיזה טלפון לשלוח");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks for a new organization default when the default cannot send", async () => {
    await expect(
      sendReportWhatsApp({
        ...screenshot,
        pick: { error: "sender_not_allowed", refused: "tenant_default" },
      }),
    ).rejects.toThrow("בעלי הארגון צריכים לבחור ברירת מחדל חדשה");
    await expect(
      sendReportWhatsApp({
        ...screenshot,
        pick: { error: "sender_not_allowed", refused: "requested" },
      }),
    ).rejects.toThrow("הטלפון שנבחר לא זמין לארגון הזה");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("explains a refused line, an unknown delivery and a timeout in Hebrew", async () => {
    const refused = new Response(
      JSON.stringify({
        error: "sender_not_allowed",
        code: "sender_not_allowed",
      }),
      {
        status: 403,
      },
    );
    invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(refused),
    });
    await expect(
      sendReportWhatsApp({ ...screenshot, pick: green }),
    ).rejects.toThrow("הטלפון שנבחר לא זמין לארגון הזה");

    invoke.mockResolvedValueOnce({
      data: { success: false, delivered: "unknown" },
      error: null,
    });
    await expect(
      sendReportWhatsApp({ ...screenshot, pick: carmen }),
    ).rejects.toThrow("בדקו בוואטסאפ לפני ששולחים שוב");

    const aborted = new DOMException("aborted", "AbortError");
    invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsFetchError(aborted),
    });
    await expect(
      sendReportWhatsApp({ ...screenshot, pick: green, timeoutMs: 60_000 }),
    ).rejects.toThrow("השליחה ארכה יותר מדי");
    expect(invoke.mock.calls[2][1].timeout).toBe(60_000);
  });

  it("translates codes and older English texts from the send functions", async () => {
    const replies = [
      {
        status: 400,
        body: { error: "missing_group_chat_id", code: "missing_group_chat_id" },
      },
      { status: 400, body: { error: "Manus WhatsApp not configured" } },
      { status: 403, body: { error: "Forbidden" } },
      { status: 500, body: { error: "Internal error" } },
    ];
    for (const reply of replies) {
      invoke.mockResolvedValueOnce({
        data: null,
        error: new FunctionsHttpError(
          new Response(JSON.stringify(reply.body), { status: reply.status }),
        ),
      });
    }
    for (const expected of [
      "לקבוצה שנבחרה אין מזהה וואטסאפ",
      "הטלפון שנבחר עוד לא מחובר עד הסוף",
      "אין לכם הרשאה לשלוח בשם הארגון הזה",
      "השליחה בוואטסאפ נכשלה",
    ]) {
      await expect(
        sendReportWhatsApp({ ...screenshot, pick: carmen }),
      ).rejects.toThrow(expected);
    }
  });
});
