import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { findAttachments, parseEmailHeader } from "./gmail-message.ts";

Deno.test("parseEmailHeader matches header names case-insensitively", () => {
  const payload = { headers: [{ name: "Subject", value: "Invoice 7" }, {}] };
  assertStrictEquals(parseEmailHeader(payload, "subject"), "Invoice 7");
  assertStrictEquals(parseEmailHeader(payload, "From"), "");
  assertStrictEquals(parseEmailHeader(undefined, "From"), "");
});

Deno.test(
  "findAttachments walks nested parts and skips parts without attachments",
  () => {
    const parts = [
      { filename: "", mimeType: "text/plain", body: { size: 3 } },
      {
        filename: "",
        mimeType: "multipart/mixed",
        parts: [
          {
            filename: "a.pdf",
            mimeType: "application/pdf",
            body: { attachmentId: "att-1", size: 42 },
          },
        ],
      },
    ];
    assertEquals(findAttachments(parts), [
      {
        filename: "a.pdf",
        mimeType: "application/pdf",
        attachmentId: "att-1",
        size: 42,
      },
    ]);
    assertEquals(findAttachments(undefined), []);
  },
);
