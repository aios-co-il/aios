import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  resolveSignatureEmailColors,
  signatureRequestBody,
  signatureRequestSubject,
} from "./signature-email-template.ts";

Deno.test("request subject fills the document title", () => {
  assertStrictEquals(
    signatureRequestSubject(
      { subject: "לחתימה: {{title}}" },
      { title: "הסכם" },
    ),
    "לחתימה: הסכם",
  );
});

Deno.test("empty subject falls back to the default", () => {
  assertStrictEquals(
    signatureRequestSubject({ subject: "  " }, { title: "הסכם" }),
    "בקשה לחתימה: הסכם",
  );
});

Deno.test("body placeholders are replaced", () => {
  assertStrictEquals(
    signatureRequestBody(
      { body: "שלום {{first_name}}, מ{{sender}}" },
      { first_name: "רעיה", sender: "דוד" },
    ),
    "שלום רעיה, מדוד",
  );
});

Deno.test("email colors keep saved hex and drop unsafe values", () => {
  const colors = resolveSignatureEmailColors({
    headerColor: "#ABC",
    buttonColor: "red;background:url(x)",
    textColor: "#112233",
  });
  assertStrictEquals(colors.headerColor, "#aabbcc");
  assertStrictEquals(colors.buttonColor, "#2563eb");
  assertStrictEquals(colors.textColor, "#112233");
  assertStrictEquals(colors.pageBackground, "#f5f5f5");
});
