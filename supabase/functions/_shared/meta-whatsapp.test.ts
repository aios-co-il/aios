import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  dropUnresolvedTemplateLines,
  explainMetaWhatsAppError,
  extractMetaErrorCodeFromMessage,
  inboundButtonPayload,
  LEAD_OPTIN_BUTTON_PAYLOAD,
  sanitizeTemplateParameter,
  shouldApplyDeliveryStatus,
} from "./meta-whatsapp.ts";

Deno.test(
  "a lead with no screening answers does not break the template send",
  () => {
    assertStrictEquals(sanitizeTemplateParameter(""), "-");
    assertStrictEquals(sanitizeTemplateParameter("   "), "-");
    assertStrictEquals(sanitizeTemplateParameter(null), "-");
    assertStrictEquals(sanitizeTemplateParameter("\n\n"), "-");
  },
);

Deno.test(
  "a multiline Q&A block collapses to one line without doubled bullets",
  () => {
    assertStrictEquals(
      sanitizeTemplateParameter("• האם תוכל?: כן\n• ספרו לי בקצרה?: טסט"),
      "האם תוכל?: כן • ספרו לי בקצרה?: טסט",
    );
    assertStrictEquals(
      sanitizeTemplateParameter("שורה\tאחת\nשתיים"),
      "שורה • אחת • שתיים",
    );
  },
);

Deno.test("a parameter longer than Meta allows is truncated", () => {
  const truncated = sanitizeTemplateParameter("א".repeat(5000));
  assertStrictEquals(truncated.length, 1024);
  assert(truncated.endsWith("…"));
});

Deno.test("a line whose placeholder resolves to nothing is dropped", () => {
  const data: Record<string, string> = { lead_name: "רון לוי", source: "" };
  const resolve = (line: string) =>
    line.replace(
      /\{\{(\w+)\}\}/g,
      (placeholder, key) => data[key] ?? placeholder,
    );

  const raw = [
    "שם הליד: {{lead_name}}",
    "חברה: {{lead_company}}",
    "מקור: {{source}}",
    "ליד חדש התקבל",
  ].join("\n");

  assertStrictEquals(
    dropUnresolvedTemplateLines(raw, resolve),
    "שם הליד: {{lead_name}}\nליד חדש התקבל",
  );
});

Deno.test(
  "dropping unresolved lines leaves plain text and repeated placeholders alone",
  () => {
    const resolve = (line: string) => line.replace(/\{\{name\}\}/g, "דוד");
    assertStrictEquals(dropUnresolvedTemplateLines("שלום", resolve), "שלום");
    assertStrictEquals(
      dropUnresolvedTemplateLines("{{name}} ו-{{name}}", resolve),
      "{{name}} ו-{{name}}",
    );
    assertStrictEquals(dropUnresolvedTemplateLines("{{missing}}", resolve), "");
  },
);

Deno.test("delivery status only moves forward, and failure always wins", () => {
  assertStrictEquals(shouldApplyDeliveryStatus(undefined, "sent"), true);
  assertStrictEquals(shouldApplyDeliveryStatus("sent", "delivered"), true);
  assertStrictEquals(shouldApplyDeliveryStatus("delivered", "read"), true);
  assertStrictEquals(shouldApplyDeliveryStatus("read", "delivered"), false);
  assertStrictEquals(shouldApplyDeliveryStatus("read", "failed"), true);
  assertStrictEquals(shouldApplyDeliveryStatus("sent", "bogus"), false);
});

Deno.test(
  "explainMetaWhatsAppError: 131049 engagement is not retryable",
  () => {
    const explained = explainMetaWhatsAppError(131049);
    assertStrictEquals(explained.code, "131049");
    assertStrictEquals(explained.retryable, false);
    assertMatch(explained.messageHe, /131049/);
    assertMatch(explained.opsHintHe, /Quality Rating|מעורבות|איכות/);
  },
);

Deno.test("explainMetaWhatsAppError: 131042 payment points to billing", () => {
  const explained = explainMetaWhatsAppError("131042");
  assertStrictEquals(explained.retryable, false);
  assertMatch(explained.opsHintHe, /Billing|תשלום/);
});

Deno.test(
  "extractMetaErrorCodeFromMessage reads Hebrew delivery log text",
  () => {
    assertStrictEquals(
      extractMetaErrorCodeFromMessage(
        "Meta לא מסרה את ההודעה (קוד 131049): In order to maintain a healthy ecosystem engagement",
      ),
      "131049",
    );
    assertStrictEquals(
      extractMetaErrorCodeFromMessage(
        "(#200) You do not have the necessary permissions to send messages",
      ),
      "200",
    );
  },
);

Deno.test("inboundButtonPayload reads quick-reply and interactive ids", () => {
  assertStrictEquals(
    inboundButtonPayload({
      type: "button",
      button: {
        payload: LEAD_OPTIN_BUTTON_PAYLOAD,
        text: "אני מאשר/ת קבלת לידים",
      },
    }),
    LEAD_OPTIN_BUTTON_PAYLOAD,
  );
  assertStrictEquals(
    inboundButtonPayload({
      type: "interactive",
      interactive: {
        button_reply: { id: "LEAD_OPTIN_YES", title: "אני מאשר/ת קבלת לידים" },
      },
    }),
    "LEAD_OPTIN_YES",
  );
  assertStrictEquals(
    inboundButtonPayload({ type: "text", text: { body: "שלום" } }),
    null,
  );
});
