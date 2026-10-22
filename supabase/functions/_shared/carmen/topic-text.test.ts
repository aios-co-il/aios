import assert from "node:assert/strict";
import test from "node:test";
import { cleanTopic } from "./topic-text.ts";

test("keeps a short topic and strips quotes and end punctuation", () => {
  assert.equal(cleanTopic('"דוח לידים שבועי".'), "דוח לידים שבועי");
  assert.equal(
    cleanTopic("  Campaign   budget review\nextra"),
    "Campaign budget review",
  );
});

test("rejects empty or sentence-like replies", () => {
  assert.equal(cleanTopic(""), null);
  assert.equal(cleanTopic(null), null);
  assert.equal(
    cleanTopic("this is a very long reply that reads like a full sentence"),
    null,
  );
});
