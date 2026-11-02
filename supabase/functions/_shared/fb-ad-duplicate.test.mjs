import { assertStrictEquals, assertThrows } from "jsr:@std/assert@1";
import {
  applyVariantToObjectStorySpec,
  applyVariantToAssetFeedSpec,
  extractLeadFormId,
  normalizeAdCopyVariants,
  summarizeSourceAd,
} from "./fb-ad-duplicate.mjs";

const SOURCE_SPEC = {
  page_id: "111",
  link_data: {
    message: "old body",
    name: "old headline",
    link: "https://fb.me/111",
    image_hash: "abc123",
    call_to_action: {
      type: "SIGN_UP",
      value: { lead_gen_form_id: "999888" },
    },
  },
};

Deno.test("extractLeadFormId reads CTA lead form", () => {
  assertStrictEquals(extractLeadFormId(SOURCE_SPEC), "999888");
  assertStrictEquals(
    extractLeadFormId({
      video_data: { call_to_action: { value: { lead_gen_form_id: "1" } } },
    }),
    "1",
  );
  assertStrictEquals(extractLeadFormId({}), null);
});

Deno.test(
  "applyVariantToObjectStorySpec changes copy but keeps media + lead form",
  () => {
    const next = applyVariantToObjectStorySpec(SOURCE_SPEC, {
      primary_text: "חדש — האיום לא מחכה",
      headline: "כותרת חדשה",
    });
    assertStrictEquals(next.page_id, "111");
    assertStrictEquals(next.link_data.message, "חדש — האיום לא מחכה");
    assertStrictEquals(next.link_data.name, "כותרת חדשה");
    assertStrictEquals(next.link_data.image_hash, "abc123");
    assertStrictEquals(
      next.link_data.call_to_action.value.lead_gen_form_id,
      "999888",
    );
    // source untouched
    assertStrictEquals(SOURCE_SPEC.link_data.message, "old body");
  },
);

Deno.test("applyVariantToAssetFeedSpec updates first body/title", () => {
  const feed = applyVariantToAssetFeedSpec(
    {
      bodies: [{ text: "a" }],
      titles: [{ text: "t" }],
      images: [{ hash: "h" }],
    },
    { primary_text: "body2", headline: "title2" },
  );
  assertStrictEquals(feed.bodies[0].text, "body2");
  assertStrictEquals(feed.titles[0].text, "title2");
  assertStrictEquals(feed.images[0].hash, "h");
});

Deno.test("normalizeAdCopyVariants validates count and primary_text", () => {
  const v = normalizeAdCopyVariants({
    count: 2,
    variants: [
      { primary_text: "one", headline: "h1" },
      { primary_text: "two", headline: "h2" },
      { primary_text: "three" },
    ],
  });
  assertStrictEquals(v.length, 2);
  assertStrictEquals(v[1].primary_text, "two");
  assertThrows(
    () => normalizeAdCopyVariants({ variants: [] }),
    Error,
    "variants_required",
  );
  assertThrows(
    () =>
      normalizeAdCopyVariants({ count: 3, variants: [{ primary_text: "a" }] }),
    Error,
    "variants_count_mismatch",
  );
});

Deno.test("summarizeSourceAd exposes adset/page/lead form for Carmen", () => {
  const summary = summarizeSourceAd(
    {
      id: "ad1",
      name: "win",
      adset_id: "as1",
      campaign_id: "c1",
      account_id: "act_55",
      status: "PAUSED",
    },
    { id: "cr1", object_story_spec: SOURCE_SPEC },
  );
  assertStrictEquals(summary.adset_id, "as1");
  assertStrictEquals(summary.page_id, "111");
  assertStrictEquals(summary.lead_form_id, "999888");
  assertStrictEquals(summary.creative_id, "cr1");
  assertStrictEquals(summary.account_id, "55");
});
