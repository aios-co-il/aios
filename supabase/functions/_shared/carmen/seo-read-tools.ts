/**
 * Carmen's read-only SEO / GEO tools. The names live here because two callers
 * need them: run-ai-agent registers and dispatches the tools, and the token
 * optimizer promotes them when a message asks about a client's SEO.
 */
export const SEO_READ_TOOL_NAMES = [
  "get_seo_overview",
  "get_search_console_performance",
  "get_ahrefs_snapshot",
  "get_seo_program",
  "get_ai_visibility",
] as const;

/** One of the SEO read tool names. */
export type SeoReadToolName = (typeof SEO_READ_TOOL_NAMES)[number];

/** Is this one of the SEO read tools? */
export function isSeoReadTool(name: string): name is SeoReadToolName {
  return SEO_READ_TOOL_NAMES.some((tool) => tool === name);
}

// Hebrew and English ways people ask about organic search or AI visibility.
const SEO_INTENT =
  /(\bseo\b|סיאו|אס\s*אי\s*או|קידום\s*אורגני|תנועה\s*אורגנית|אורגני|search\s*console|סרץ'?\s*קונסול|\bgsc\b|ahrefs|אהרפס|\bdr\b|דומיין\s*רייטינג|בקלינק|backlink|מילות\s*מפתח|ביטויים\s*במעקב|מיקומים\s*בגוגל|דירוג\s*בגוגל|\bgeo\b|נראות\s*ב-?\s*(ai|בינה)|chatgpt|צ'?אט\s*ג'?יפיטי|perplexity|gemini|לוח\s*תוכן|כתבות\s*seo|מאמר|כתבה|עדכון\s*חודשי)/i;

/** True when the message asks about SEO, Search Console, Ahrefs or GEO. */
export function hasSeoIntent(text: string): boolean {
  return SEO_INTENT.test(String(text || ""));
}
