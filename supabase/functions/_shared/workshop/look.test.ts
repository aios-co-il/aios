import assert from "node:assert/strict";
import { test } from "node:test";
import { lookOf, stillPrompt, withLook } from "./look.ts";

test("references from the tool and from attached style references merge, https only, capped", () => {
  const look = lookOf({
    style_references: [{ url: "https://x/a.png" }, { url: "http://x/b.png" }],
    workshop_look: {
      references: ["https://x/c.png", "https://x/a.png", "ftp://x/d"],
      bible: "teal blazer",
    },
  });
  assert.deepEqual(look.references, ["https://x/c.png", "https://x/a.png"]);
  assert.equal(look.bible, "teal blazer");
  assert.equal(look.anchorUrl, null);
  const many = lookOf({
    workshop_look: {
      references: Array.from({ length: 9 }, (_, i) => `https://x/${i}.png`),
    },
  });
  assert.equal(many.references.length, 4);
});

test("new references go first, a new bible replaces the old one, nothing new changes nothing", () => {
  const base = {
    keep: 1,
    workshop_look: { references: ["https://x/old.png"], bible: "old" },
  };
  const next = withLook(base, {
    reference_urls: ["https://x/new.png"],
    style_bible: "  new bible ",
  });
  assert.equal(next.changed, true);
  assert.equal(next.payload.keep, 1);
  assert.deepEqual((next.payload.workshop_look as any).references, [
    "https://x/new.png",
    "https://x/old.png",
  ]);
  assert.equal((next.payload.workshop_look as any).bible, "new bible");
  assert.equal(withLook(base, {}).changed, false);
  assert.equal(withLook(base, {}).payload, base);
});

test("the anchor is set and cleared without touching the references", () => {
  const set = withLook({}, {}, { anchorUrl: "https://x/first.png" });
  assert.equal(lookOf(set.payload).anchorUrl, "https://x/first.png");
  const cleared = withLook(set.payload, {}, { anchorUrl: null });
  assert.equal(lookOf(cleared.payload).anchorUrl, null);
  assert.equal(withLook({}, {}, { anchorUrl: null }).changed, false);
});

test("the prompt carries the bible and tells the model which images are which", () => {
  const prompt = stillPrompt({
    visual: "she smiles at the camera",
    look: { bible: "Carmen, dark bob" },
    userReferences: 2,
    hasAnchor: true,
    suffix: "No text.",
  });
  assert.match(prompt, /Carmen, dark bob/);
  assert.match(prompt, /first 2 attached image/);
  assert.match(prompt, /last attached image/);
  assert.match(prompt, /No text\.$/);
  const bare = stillPrompt({
    visual: "x",
    look: { bible: "" },
    userReferences: 0,
    hasAnchor: false,
    suffix: "",
  });
  assert.match(bare, /consistent character/);
  assert.doesNotMatch(bare, /attached/);
});
