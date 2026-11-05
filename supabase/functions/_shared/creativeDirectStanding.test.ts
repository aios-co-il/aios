import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  CREATIVE_DIRECT_SKIN,
  CREATIVE_DIRECT_SKIN_SLUG,
} from "./creativeDirectStanding.ts";

Deno.test(
  "Carmen creative-person skin is creative_direct / איש קריאייטיב",
  () => {
    assertStrictEquals(CREATIVE_DIRECT_SKIN_SLUG, "creative_direct");
    assertStrictEquals(CREATIVE_DIRECT_SKIN.name, "איש קריאייטיב");
    assertMatch(
      CREATIVE_DIRECT_SKIN.system_prompt,
      /mcp_Cursor__generate_creative/,
    );
    assertMatch(CREATIVE_DIRECT_SKIN.constraints, /TYPE בלבד/);
    assertMatch(CREATIVE_DIRECT_SKIN.constraints, /STYLE CHANGE/);
    assertMatch(CREATIVE_DIRECT_SKIN.system_prompt, /צבעי מותג/);
    assertMatch(CREATIVE_DIRECT_SKIN.system_prompt, /סגנון שנבחר/);
    assert(CREATIVE_DIRECT_SKIN.triggers.includes("קריאייטיב דיירקט"));
  },
);
