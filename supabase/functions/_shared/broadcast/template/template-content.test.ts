import { assertEquals } from "jsr:@std/assert@1";
import { templateContent } from "./template-content.ts";

const baseTemplate = {
  subject: "S",
  body_text: "T",
  body_html: "<p>H</p>",
  html_mode: null,
  attachments: [{ name: "a.pdf", url: "https://x/a.pdf" }, "bad"],
  media_url: "https://x/m.png",
};

Deno.test("templateContent keeps the email fields of an email template", () => {
  assertEquals(templateContent({ ...baseTemplate, channel: "email" }), {
    channel: "email",
    subject: "S",
    bodyText: "T",
    bodyHtml: "<p>H</p>",
    htmlMode: false,
    attachments: [{ name: "a.pdf", url: "https://x/a.pdf" }],
  });
});

Deno.test("templateContent keeps text and media for WhatsApp", () => {
  assertEquals(templateContent({ ...baseTemplate, channel: "whatsapp" }), {
    channel: "whatsapp",
    bodyText: "T",
    mediaUrl: "https://x/m.png",
  });
});
