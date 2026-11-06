import { assertEquals } from "jsr:@std/assert@1";
import { integrationTypesFor, WHATSAPP_LINE_TYPES } from "./whatsapp-lines.ts";

Deno.test("asking for whatsapp lines returns every WhatsApp line type", () => {
  // Before: the filter was the literal "whatsapp", which no stored type matches.
  assertEquals(integrationTypesFor("whatsapp"), WHATSAPP_LINE_TYPES);
  assertEquals(integrationTypesFor(" WhatsApp "), WHATSAPP_LINE_TYPES);
  assertEquals(integrationTypesFor("וואטסאפ"), WHATSAPP_LINE_TYPES);
});

Deno.test("any other type is matched exactly", () => {
  assertEquals(integrationTypesFor("green_api"), ["green_api"]);
  assertEquals(integrationTypesFor("llm"), ["llm"]);
});
