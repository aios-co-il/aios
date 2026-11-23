/**
 * Carmen's SEO / GEO tools that change data or spend money. Each one queues an
 * approval row and runs only after a person approves it. The names live here
 * because run-ai-agent dispatches them and the token optimizer promotes them.
 */
export const SEO_ACTION_TOOL_NAMES = [
  "run_ai_visibility_scan",
  "check_serp_rankings",
  "upsert_seo_keywords",
  "generate_seo_article_draft",
  "publish_seo_article",
] as const;

/** One of the SEO action tool names. */
export type SeoActionToolName = (typeof SEO_ACTION_TOOL_NAMES)[number];

/** Is this one of the SEO action tools? */
export function isSeoActionTool(name: string): name is SeoActionToolName {
  return SEO_ACTION_TOOL_NAMES.some((tool) => tool === name);
}
