import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  extractEntityAttachmentPath,
  isAbsoluteHttpUrl,
  publishingImageProxyUrl,
  publishingImageStoragePath,
  resolveArticleImageFields,
  resolveMagazineImageUrl,
} from "./publishing-images.ts";

const SUPABASE_URL = "https://zvoijyneresvkadpprel.supabase.co";
const TENANT = "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019";
const ARTICLE = "c3ee1a9c-1111-2222-3333-444455556666";
const proxyFor = (kind) => publishingImageProxyUrl(SUPABASE_URL, ARTICLE, kind);

Deno.test("builds deterministic storage paths and stable proxy URLs", () => {
  assertStrictEquals(
    publishingImageStoragePath(TENANT, ARTICLE, "hero"),
    `${TENANT}/publishing/${ARTICLE}/hero.webp`,
  );
  assertStrictEquals(
    publishingImageProxyUrl(SUPABASE_URL, ARTICLE, "inline"),
    `${SUPABASE_URL}/functions/v1/publishing-image?article_id=${ARTICLE}&kind=inline`,
  );
  assertStrictEquals(
    publishingImageProxyUrl(`${SUPABASE_URL}/`, ARTICLE, "hero"),
    `${SUPABASE_URL}/functions/v1/publishing-image?article_id=${ARTICLE}&kind=hero`,
  );
});

Deno.test("rejects relative and empty magazine image URLs", () => {
  assertStrictEquals(
    isAbsoluteHttpUrl("/images/gold-appraisal-hero.webp"),
    false,
  );
  assertStrictEquals(
    resolveMagazineImageUrl(
      "/images/gold-appraisal-hero.webp",
      "hero",
      proxyFor,
    ),
    null,
  );
  assertStrictEquals(
    resolveMagazineImageUrl(
      "/images/gold-appraisal-process.webp",
      "inline",
      proxyFor,
    ),
    null,
  );
  assertStrictEquals(resolveMagazineImageUrl("", "hero", proxyFor), null);
  assertStrictEquals(resolveMagazineImageUrl(null, "hero", proxyFor), null);
});

Deno.test(
  "extracts entity-attachments paths from public and signed URLs",
  () => {
    const path = `${TENANT}/publishing/${ARTICLE}/hero.webp`;
    assertStrictEquals(
      extractEntityAttachmentPath(
        `${SUPABASE_URL}/storage/v1/object/public/entity-attachments/${path}`,
      ),
      path,
    );
    assertStrictEquals(
      extractEntityAttachmentPath(
        `${SUPABASE_URL}/storage/v1/object/sign/entity-attachments/${path}?token=abc`,
      ),
      path,
    );
    assertStrictEquals(extractEntityAttachmentPath(path), path);
    assertStrictEquals(
      extractEntityAttachmentPath(`entity-attachments/${path}`),
      path,
    );
    assertStrictEquals(
      extractEntityAttachmentPath("https://images.pexels.com/photo.jpg"),
      null,
    );
  },
);

Deno.test("rewrites private storage URLs to the stable image proxy", () => {
  const path = `${TENANT}/publishing/${ARTICLE}/hero.webp`;
  assertStrictEquals(
    resolveMagazineImageUrl(
      `${SUPABASE_URL}/storage/v1/object/public/entity-attachments/${path}`,
      "hero",
      proxyFor,
    ),
    proxyFor("hero"),
  );
  assertStrictEquals(
    resolveMagazineImageUrl(
      `${SUPABASE_URL}/storage/v1/object/sign/entity-attachments/${path}?token=x`,
      "hero",
      proxyFor,
    ),
    proxyFor("hero"),
  );
});

Deno.test("passes through proxy and external absolute URLs unchanged", () => {
  const external =
    "https://images.pexels.com/photos/31428953/pexels-photo-31428953.jpeg";
  assertStrictEquals(
    resolveMagazineImageUrl(external, "hero", proxyFor),
    external,
  );
  assertStrictEquals(
    resolveMagazineImageUrl(proxyFor("hero"), "hero", proxyFor),
    proxyFor("hero"),
  );
});

Deno.test("resolves hero and inline fields with their own kinds", () => {
  const article = resolveArticleImageFields(
    {
      hero_image_url: "/images/gold-appraisal-hero.webp",
      inline_image_url: `${SUPABASE_URL}/storage/v1/object/public/entity-attachments/${TENANT}/publishing/${ARTICLE}/inline.webp`,
    },
    proxyFor,
  );
  assertStrictEquals(article.hero_image_url, null);
  assertStrictEquals(article.inline_image_url, proxyFor("inline"));
});
