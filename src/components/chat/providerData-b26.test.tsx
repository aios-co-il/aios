import { describe, expect, it } from "vitest";
import { parseChatProviderData } from "./providerData-b26";

describe("parseChatProviderData", () => {
  it("keeps the Green API fields the chat UI reads", () => {
    const parsed = parseChatProviderData({
      idMessage: "ABC",
      senderData: { sender: "972500000000@c.us" },
      messageData: {
        typeMessage: "quotedMessage",
        extendedTextMessageData: { text: "reply" },
        quotedMessage: {
          stanzaId: "XYZ",
          participant: "972511111111@c.us",
          typeMessage: "imageMessage",
          downloadUrl: "https://x/y.jpg",
        },
        fileMessageData: { downloadUrl: "https://x/f.pdf", fileName: "f.pdf" },
      },
      delivery_status: "failed",
      delivery_error: { title: "t", error_data: { details: "d" } },
    });
    expect(parsed?.idMessage).toBe("ABC");
    expect(parsed?.senderData?.sender).toBe("972500000000@c.us");
    expect(parsed?.messageData?.extendedTextMessageData?.text).toBe("reply");
    expect(parsed?.messageData?.quotedMessage?.stanzaId).toBe("XYZ");
    expect(parsed?.messageData?.fileMessageData?.fileName).toBe("f.pdf");
    expect(parsed?.delivery_error?.error_data?.details).toBe("d");
  });

  it("drops non-string fields and non-object payloads", () => {
    expect(parseChatProviderData(null)).toBeUndefined();
    expect(parseChatProviderData("raw")).toBeUndefined();
    const parsed = parseChatProviderData({
      idMessage: 5,
      messageData: "oops",
      senderData: { sender: 1 },
    });
    expect(parsed?.idMessage).toBeUndefined();
    expect(parsed?.messageData).toBeUndefined();
    expect(parsed?.senderData?.sender).toBeUndefined();
  });
});
