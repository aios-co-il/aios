import { assertStrictEquals } from "jsr:@std/assert@1";
import { cleanTopic } from "./topic-text.ts";

Deno.test("keeps a short topic and strips quotes and end punctuation", () => {
  assertStrictEquals(cleanTopic('"דוח לידים שבועי".'), "דוח לידים שבועי");
  assertStrictEquals(
    cleanTopic("  Campaign   budget review\nextra"),
    "Campaign budget review",
  );
});

Deno.test("rejects empty or sentence-like replies", () => {
  assertStrictEquals(cleanTopic(""), null);
  assertStrictEquals(cleanTopic(null), null);
  assertStrictEquals(
    cleanTopic("this is a very long reply that reads like a full sentence"),
    null,
  );
});
