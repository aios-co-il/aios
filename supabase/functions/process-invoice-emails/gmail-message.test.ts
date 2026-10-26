import assert from "node:assert/strict";
import test from "node:test";
import { findAttachments, parseEmailHeader } from "./gmail-message.ts";

test("parseEmailHeader matches header names case-insensitively", () => {
  const payload = { headers: [{ name: "Subject", value: "Invoice 7" }, {}] };
  assert.equal(parseEmailHeader(payload, "subject"), "Invoice 7");
  assert.equal(parseEmailHeader(payload, "From"), "");
  assert.equal(parseEmailHeader(undefined, "From"), "");
});

test("findAttachments walks nested parts and skips parts without attachments", () => {
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
  assert.deepEqual(findAttachments(parts), [
    {
      filename: "a.pdf",
      mimeType: "application/pdf",
      attachmentId: "att-1",
      size: 42,
    },
  ]);
  assert.deepEqual(findAttachments(undefined), []);
});
