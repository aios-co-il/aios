import { assertEquals } from "jsr:@std/assert@1";
import type { MediaToSend } from "./gateway.ts";
import type { SentOutcome } from "./handler.ts";
import type { SendContext } from "./prepare.ts";
import { sentFileRow } from "./record.ts";
import type { FileSendRequest } from "./request.ts";

const SENT: SentOutcome = {
  status: "sent",
  messageId: "m-1",
  deliveredAs: "media",
};

const SCREENSHOT: MediaToSend = {
  url: "https://storage.local/signed",
  isImage: true,
  mimeType: "image/png",
  filename: "report.png",
};

/** A browser report screenshot to a phone, unless overridden. */
function context(
  request: Partial<FileSendRequest> = {},
  overrides: Partial<SendContext> = {},
): SendContext {
  return {
    request: {
      clientId: "client-1",
      leadId: null,
      groupId: null,
      phoneNumber: "0501234567",
      tenantId: "tenant-dmm",
      integrationId: "carmen",
      senderUserId: null,
      caption: "",
      captionFallback: true,
      sendKind: "report",
      sendRef: "report-1",
      media: {
        kind: "upload",
        file: new File([new Uint8Array([1])], "report.png"),
        isImage: true,
      },
      ...request,
    },
    isServiceRole: false,
    userId: "user-member",
    tenantId: "tenant-dmm",
    line: {
      id: "carmen",
      tenant_id: "tenant-dmm",
      user_id: "user-owner",
      api_key: "key",
      settings: { instance_id: "inst" },
    },
    target: { to: "972501234567", isGroup: false },
    ...overrides,
  };
}

Deno.test("sentFileRow stamps the send for the client card", async (t) => {
  await t.step("a browser report keeps its kind and reference", () => {
    const row = sentFileRow(context(), SCREENSHOT, SENT);
    assertEquals(row.send_kind, "report");
    assertEquals(row.send_ref, "report-1");
    assertEquals(row.client_id, "client-1");
    assertEquals(row.integration_id, "carmen");
    assertEquals(row.connection_user_id, "user-owner");
    assertEquals(row.sent_by_user_id, "user-member");
    assertEquals(row.sender_phone, "972501234567");
    assertEquals(row.message_text, "[תמונה]");
  });

  await t.step("a browser may not stamp a service kind", () => {
    const row = sentFileRow(
      context({ sendKind: "broadcast" }),
      SCREENSHOT,
      SENT,
    );
    assertEquals(row.send_kind, "chat");
  });

  await t.step("a broadcast keeps its kind; one naming none has none", () => {
    const broadcast = context(
      { sendKind: "broadcast", sendRef: "broadcast-1" },
      { isServiceRole: true },
    );
    assertEquals(
      sentFileRow(broadcast, SCREENSHOT, SENT).send_kind,
      "broadcast",
    );
    const unnamed = context({ sendKind: undefined }, { isServiceRole: true });
    assertEquals(sentFileRow(unnamed, SCREENSHOT, SENT).send_kind, null);
  });
});

Deno.test("sentFileRow records where the file went", async (t) => {
  await t.step("a group: its id, no phone", () => {
    const row = sentFileRow(
      context(
        { groupId: "group-1" },
        { target: { to: "120363416882903532@g.us", isGroup: true } },
      ),
      SCREENSHOT,
      SENT,
    );
    assertEquals(row.group_id, "group-1");
    assertEquals(row.sender_phone, null);
  });

  await t.step("a broadcast URL is kept, a signed upload URL is not", () => {
    const provider = {
      messageId: "m-1",
      delivered_as: "media",
      mimeType: "image/png",
      filename: "report.png",
      isImage: true,
    };
    assertEquals(sentFileRow(context(), SCREENSHOT, SENT).raw_provider_data, {
      ...provider,
      fileUrl: null,
    });
    const url = { ...SCREENSHOT, url: "https://cdn.local/promo.png" };
    const broadcast = context({ media: { kind: "url", ...url } });
    assertEquals(sentFileRow(broadcast, url, SENT).raw_provider_data, {
      ...provider,
      fileUrl: "https://cdn.local/promo.png",
    });
  });
});
