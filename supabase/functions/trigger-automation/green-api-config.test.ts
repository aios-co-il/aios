import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { readGreenApiConfig } from "./green-api-config.ts";
Deno.test(
  "WhatsApp action config validates known string fields and recipient shapes",
  () => {
    assertEquals(
      readGreenApiConfig({
        message_template: "hello",
        media_url: "https://example.com",
        recipients: [{ type: "phone_manual", phone: "972500000000" }],
      }).message_template,
      "hello",
    );
    assertThrows(() =>
      readGreenApiConfig({ message_template: { text: "hello" } }),
    );
    assertThrows(() =>
      readGreenApiConfig({
        recipients: [{ type: "phone_manual", phone: { value: "x" } }],
      }),
    );
  },
);
