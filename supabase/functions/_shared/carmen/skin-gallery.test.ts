import {
  assertEquals,
  assertStrictEquals,
  assertMatch,
} from "jsr:@std/assert@1";
import {
  CARMEN_DEFAULT_PORTRAIT,
  carmenSkinEntries,
  carmenSkinsResult,
  customSkinPaths,
  pathsToSign,
} from "./skin-gallery.ts";
import { CARMEN_ROLES } from "./skin-roles.ts";

const TENANT = "t-1";

Deno.test("every persona comes back with its built-in portrait", () => {
  const entries = carmenSkinEntries();
  assertStrictEquals(entries.length, CARMEN_ROLES.length);
  const designer = entries.find((e) => e.slug === "creative_direct")!;
  assertEquals(designer, {
    slug: "creative_direct",
    name: "מעצבת",
    members: [
      "creative_direct",
      "designer",
      "graphic_designer",
      "workshop_designer",
    ],
    has_portrait: true,
    portrait_url: "/brand/carmen/skins/designer.webp",
    source: "builtin",
  });
  for (const entry of entries.filter((e) => e.source === "builtin"))
    assertMatch(entry.portrait_url, /^\/brand\/carmen\/skins\/[a-z-]+\.webp$/);
});

Deno.test(
  "the marketing manager has no portrait and shows the general image",
  () => {
    const manager = carmenSkinEntries().find(
      (e) => e.slug === "marketing_manager",
    )!;
    assertStrictEquals(manager.has_portrait, false);
    assertStrictEquals(manager.portrait_url, CARMEN_DEFAULT_PORTRAIT);
    assertStrictEquals(manager.source, "default");
  },
);

Deno.test("a custom image of the tenant replaces the built-in portrait", () => {
  const paths = customSkinPaths(
    {
      visual_identity: {
        skins: {
          workshop_designer: { avatarPath: `${TENANT}/agent-avatars/d/1.png` },
          ceo: { avatarPath: `${TENANT}/agent-avatars/ceo/2.webp` },
        },
      },
    },
    TENANT,
  );
  const signed = {
    [`${TENANT}/agent-avatars/d/1.png`]: "https://signed/1",
    [`${TENANT}/agent-avatars/ceo/2.webp`]: "https://signed/2",
  };
  const entries = carmenSkinEntries(paths, signed);
  const designer = entries.find((e) => e.slug === "creative_direct")!;
  assertStrictEquals(designer.portrait_url, "https://signed/1");
  assertStrictEquals(designer.source, "custom");
  assertStrictEquals(designer.custom_skin, "workshop_designer");
  const manager = entries.find((e) => e.slug === "marketing_manager")!;
  assertStrictEquals(manager.has_portrait, true);
  assertStrictEquals(manager.source, "custom");
});

Deno.test("the persona's own slug wins over a member skin", () => {
  const paths = {
    designer: `${TENANT}/agent-avatars/a.png`,
    creative_direct: `${TENANT}/agent-avatars/b.png`,
  };
  assertEquals(pathsToSign(paths), [`${TENANT}/agent-avatars/b.png`]);
});

Deno.test("an unsigned custom image keeps the built-in portrait", () => {
  const entries = carmenSkinEntries(
    { copywriter: `${TENANT}/agent-avatars/c.png` },
    {},
  );
  const copywriter = entries.find((e) => e.slug === "copywriter")!;
  assertStrictEquals(copywriter.source, "builtin");
  assertStrictEquals(
    copywriter.portrait_url,
    "/brand/carmen/skins/copywriter.webp",
  );
});

Deno.test("paths outside the tenant's avatar folder are ignored", () => {
  assertEquals(
    customSkinPaths(
      {
        visual_identity: {
          skins: {
            copywriter: { avatarPath: "other-tenant/agent-avatars/x.png" },
            analyst: { avatarPath: `${TENANT}/private/x.png` },
            seo: { avatarPath: 42 },
          },
        },
      },
      TENANT,
    ),
    {},
  );
  assertEquals(customSkinPaths(null, TENANT), {});
  assertEquals(customSkinPaths({ visual_identity: "x" }, TENANT), {});
});

Deno.test(
  "the result tells Carmen to show portraits as Markdown images",
  () => {
    const result = carmenSkinsResult(carmenSkinEntries());
    assertStrictEquals(result.count, CARMEN_ROLES.length);
    assertMatch(result.how_to_show, /!\[/);
  },
);
