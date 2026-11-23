import { assertEquals } from "jsr:@std/assert@1";
import { SEO_ACTION_TOOL_NAMES } from "../../_shared/carmen/seo-action-tools.ts";
import { classifyDirectTool } from "../../_shared/carmen-direct-tools.mjs";
import { approvalRiskClass } from "../../_shared/carmen/approvals/risk-classes.ts";
import { seoActionTools } from "./seo-actions.ts";

Deno.test("the SEO action schemas are exactly the registered names", () => {
  assertEquals(
    seoActionTools.map((tool) => tool.name),
    [...SEO_ACTION_TOOL_NAMES],
  );
});

Deno.test(
  "coding agents reach the SEO actions through their own approval queue",
  () => {
    // Tools that queue themselves are not listed in DIRECT_APPROVAL_TOOLS.
    for (const name of SEO_ACTION_TOOL_NAMES) {
      assertEquals(classifyDirectTool(name), "direct", name);
    }
  },
);

Deno.test(
  "spend and public posts need an approver role; keywords do not",
  () => {
    assertEquals(
      Object.fromEntries(
        SEO_ACTION_TOOL_NAMES.map((name) => [
          name,
          approvalRiskClass({ tool_name: name }),
        ]),
      ),
      {
        run_ai_visibility_scan: "money",
        check_serp_rankings: "money",
        upsert_seo_keywords: "internal_write",
        generate_seo_article_draft: "money",
        publish_seo_article: "external_send",
      },
    );
  },
);
