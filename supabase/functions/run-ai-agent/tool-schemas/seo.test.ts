import { assertEquals } from "jsr:@std/assert@1";
import { SEO_READ_TOOL_NAMES } from "../../_shared/carmen/seo-read-tools.ts";
import { directToolPool } from "../../_shared/carmen-direct-tools.mjs";
import { seoTools } from "./seo.ts";

Deno.test("the SEO tool schemas are exactly the registered names", () => {
  assertEquals(
    seoTools.map((tool) => tool.name),
    [...SEO_READ_TOOL_NAMES],
  );
});

Deno.test(
  "SEO read tools are offered directly to coding agents, without approval",
  () => {
    assertEquals(
      directToolPool(seoTools).map((tool) => tool.name),
      [...SEO_READ_TOOL_NAMES],
    );
  },
);
