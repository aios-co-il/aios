import type { SeoReadToolName } from "../../_shared/carmen/seo-read-tools.ts";
import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import {
  DEFAULT_TOP_N,
  OVERVIEW_TOP_N,
  isRefusal,
  parseSeoArgs,
  resolveSeoClient,
} from "./client.ts";
import { ahrefsSnapshot } from "./ahrefs.ts";
import { aiVisibility } from "./ai-visibility.ts";
import { seoOverview } from "./overview.ts";
import { seoProgram } from "./program.ts";
import { searchConsolePerformance } from "./search-console.ts";

/**
 * Runs one SEO read tool: validates the arguments, resolves the client in the
 * caller's tenants with the caller's access, then reads. run-ai-agent only
 * registers and dispatches.
 */
export async function executeSeoReadTool(
  db: SeoDb,
  ctx: SeoToolContext,
  name: SeoReadToolName,
  args: Record<string, unknown>,
) {
  // The overview keeps its lists short unless top_n asks for more.
  const parsed = parseSeoArgs(
    args,
    name === "get_seo_overview" ? OVERVIEW_TOP_N : DEFAULT_TOP_N,
  );
  if (isRefusal(parsed)) {
    return parsed;
  }
  const client = await resolveSeoClient(db, ctx, parsed.clientId);
  if (isRefusal(client)) {
    return client;
  }
  return await READERS[name](db, ctx, client, parsed.topN);
}

const READERS: Record<
  SeoReadToolName,
  (
    db: SeoDb,
    ctx: SeoToolContext,
    client: SeoClient,
    topN: number,
  ) => Promise<unknown>
> = {
  get_seo_overview: seoOverview,
  get_search_console_performance: searchConsolePerformance,
  get_ahrefs_snapshot: ahrefsSnapshot,
  get_seo_program: seoProgram,
  get_ai_visibility: aiVisibility,
};
