import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { lookOf, stillPrompt, withLook } from "./look.ts";

Deno.test(
  "references from the tool and from attached style references merge, https only, capped",
  () => {
    const look = lookOf({
      style_references: [{ url: "https://x/a.png" }, { url: "http://x/b.png" }],
      workshop_look: {
        references: ["https://x/c.png", "https://x/a.png", "ftp://x/d"],
        bible: "teal blazer",
      },
    });
    assertEquals(look.references, ["https://x/c.png", "https://x/a.png"]);
    assertStrictEquals(look.bible, "teal blazer");
    assertStrictEquals(look.anchorUrl, null);
    const many = lookOf({
      workshop_look: {
        references: Array.from({ length: 9 }, (_, i) => `https://x/${i}.png`),
      },
    });
    assertStrictEquals(many.references.length, 4);
  },
);

Deno.test(
  "new references go first, a new bible replaces the old one, nothing new changes nothing",
  () => {
    const base = {
      keep: 1,
      workshop_look: { references: ["https://x/old.png"], bible: "old" },
    };
    const next = withLook(base, {
      reference_urls: ["https://x/new.png"],
      style_bible: "  new bible ",
    });
    assertStrictEquals(next.changed, true);
    assertStrictEquals(next.payload.keep, 1);
    assertEquals((next.payload.workshop_look as any).references, [
      "https://x/new.png",
      "https://x/old.png",
    ]);
    assertStrictEquals((next.payload.workshop_look as any).bible, "new bible");
    assertStrictEquals(withLook(base, {}).changed, false);
    assertStrictEquals(withLook(base, {}).payload, base);
  },
);

Deno.test(
  "the anchor is set and cleared without touching the references",
  () => {
    const set = withLook({}, {}, { anchorUrl: "https://x/first.png" });
    assertStrictEquals(lookOf(set.payload).anchorUrl, "https://x/first.png");
    const cleared = withLook(set.payload, {}, { anchorUrl: null });
    assertStrictEquals(lookOf(cleared.payload).anchorUrl, null);
    assertStrictEquals(withLook({}, {}, { anchorUrl: null }).changed, false);
  },
);

Deno.test(
  "the prompt carries the bible and tells the model which images are which",
  () => {
    const prompt = stillPrompt({
      visual: "she smiles at the camera",
      look: { bible: "Carmen, dark bob" },
      userReferences: 2,
      hasAnchor: true,
      suffix: "No text.",
    });
    assertMatch(prompt, /Carmen, dark bob/);
    assertMatch(prompt, /first 2 attached image/);
    assertMatch(prompt, /last attached image/);
    assertMatch(prompt, /No text\.$/);
    const bare = stillPrompt({
      visual: "x",
      look: { bible: "" },
      userReferences: 0,
      hasAnchor: false,
      suffix: "",
    });
    assertMatch(bare, /consistent character/);
    assertNotMatch(bare, /attached/);
  },
);

Deno.test(
  "words to print are asked for exactly once, and only when there are words",
  () => {
    const look = { bible: "" };
    const base = { look, userReferences: 0, hasAnchor: false, suffix: "" };
    const withText = stillPrompt({
      ...base,
      visual:
        'A croissant on a wooden table. The text "קפה ומאפה ב-20 ש״ח" at the top.',
    });
    assertMatch(withText, /exactly once/);
    const bare = stillPrompt({
      ...base,
      visual: "A croissant on a wooden table.",
    });
    assertNotMatch(bare, /exactly once/);
  },
);
