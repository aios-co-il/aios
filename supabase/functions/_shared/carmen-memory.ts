// Shared helpers for Carmen Memory Kingdom
import { aiEmbed } from "./ai.ts";
import type { Json, TablesInsert } from "./database.types.ts";
import { type DbClient, serviceClient } from "./supabase-clients.ts";

export function svc(): DbClient {
  return serviceClient();
}

// Embeddings via OpenAI (text-embedding-3-small, 1536 dims). Re-exported under
// the historical name so existing callers keep working.
export const embed = aiEmbed;

type PointerRow = TablesInsert<"carmen_memory_pointers">;

/** The slice of a Supabase client upsertPointer uses; typed and untyped clients both fit. */
type PointerWriter = {
  from(relation: "carmen_memory_pointers"): {
    upsert(
      values: PointerRow,
      options: { onConflict: string },
    ): PromiseLike<unknown>;
  };
};

export async function upsertPointer(
  supabase: PointerWriter,
  p: {
    tenant_id: string;
    category: string;
    subcategory?: string | null;
    path: string;
    entity_type: string;
    entity_id: string | null;
    title: string;
    summary?: string | null;
    ref_date?: string | null;
    importance?: number;
    metadata?: { [key: string]: Json | undefined };
    withEmbedding?: boolean;
  },
) {
  const row: PointerRow = {
    tenant_id: p.tenant_id,
    category: p.category,
    subcategory: p.subcategory ?? null,
    path: p.path,
    entity_type: p.entity_type,
    entity_id: p.entity_id,
    title: p.title,
    summary: p.summary ?? null,
    ref_date: p.ref_date ?? null,
    importance: p.importance ?? 50,
    metadata: p.metadata ?? {},
  };
  if (p.withEmbedding && p.summary) {
    const e = await embed(`${p.title}\n${p.summary}`);
    if (e) row.summary_embedding = JSON.stringify(e);
  }
  await supabase.from("carmen_memory_pointers").upsert(row, {
    onConflict: "tenant_id,path,entity_type,entity_id,subcategory",
  });
}

export function shortText(s: unknown, n = 240): string {
  if (!s) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
