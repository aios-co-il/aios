// Per-agent automatic memory: summarize + embed + store after each non-Carmen run.
import { aiChatJSON, aiEmbed, hasAiKey } from "./ai.ts";
import type { Json } from "./database.types.ts";
import { errorMessage } from "./error-message.ts";
import type { DbClient } from "./supabase-clients.ts";

const embed = aiEmbed;

const embeddingText = (emb: number[] | null) =>
  emb ? JSON.stringify(emb) : null;

type ParsedMemorySummary = {
  title: unknown;
  summary: unknown;
  category: unknown;
  importance: unknown;
};

function readMemorySummary(raw: unknown): ParsedMemorySummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  return {
    title: "title" in raw ? raw.title : undefined,
    summary: "summary" in raw ? raw.summary : undefined,
    category: "category" in raw ? raw.category : undefined,
    importance: "importance" in raw ? raw.importance : undefined,
  };
}

export async function summarizeAndStoreAgentMemory(opts: {
  supabase: DbClient;
  tenant_id: string;
  agent_id: string;
  user_message: string;
  assistant_output: string;
  tools_used: string[];
}) {
  try {
    if (!(await hasAiKey())) return;
    const {
      supabase,
      tenant_id,
      agent_id,
      user_message,
      assistant_output,
      tools_used,
    } = opts;
    if (!user_message?.trim() || !assistant_output?.trim()) return;

    const prompt = `סכם את האינטראקציה הבאה בין משתמש לסוכן AI ב-2-3 משפטים. החזר JSON תקין בלבד עם השדות: title (כותרת קצרה), summary (סיכום), category (אחד מ: conversation, instruction, fact, task, preference), importance (1-100).
משתמש: ${user_message.slice(0, 2000)}
סוכן: ${assistant_output.slice(0, 2000)}
כלים: ${tools_used.join(", ") || "ללא"}`;

    const parsed = readMemorySummary(await aiChatJSON<unknown>(prompt));
    if (!parsed || !parsed.title || !parsed.summary) return;

    const emb = await embed(`${parsed.title}\n${parsed.summary}`);

    await supabase.from("agent_memory").insert({
      tenant_id,
      agent_id,
      category: parsed.category ? String(parsed.category) : "conversation",
      title: String(parsed.title).slice(0, 200),
      summary: String(parsed.summary).slice(0, 2000),
      summary_embedding: embeddingText(emb),
      importance: Math.min(100, Math.max(1, Number(parsed.importance) || 50)),
      metadata: { tools_used },
    });
  } catch (e) {
    console.error("[agent-memory] store error:", errorMessage(e));
  }
}

export async function recallAgentMemory(
  supabase: DbClient,
  agent_id: string,
  query_text: string,
  limit = 6,
): Promise<{ title: string; summary: string; category: string }[]> {
  try {
    const emb = await embed(query_text);
    if (!emb) return [];
    const { data } = await supabase.rpc("match_agent_memory", {
      p_agent_id: agent_id,
      p_query_embedding: JSON.stringify(emb),
      p_limit: limit,
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Fast FTS-based recall over agent_memory.fts (Hebrew + English).
 * Cheaper than embedding-based recall; ideal for Carmen run-start injection.
 * Falls back to most-important recent memories when query has no tokens.
 */
export async function recallAgentMemoryFTS(
  supabase: DbClient,
  opts: {
    tenant_id: string;
    agent_id?: string | null;
    query_text: string;
    limit?: number;
    min_importance?: number;
  },
): Promise<
  Array<{
    id: string;
    title: string;
    summary: string;
    category: string;
    importance: number;
    created_at: string;
  }>
> {
  try {
    const limit = opts.limit ?? 5;
    const minImp = opts.min_importance ?? 0;
    const tokens = (opts.query_text || "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t: string) => t && t.length >= 2)
      .slice(0, 12);

    let query = supabase
      .from("agent_memory")
      .select("id, title, summary, category, importance, created_at, fts")
      .eq("tenant_id", opts.tenant_id)
      .gte("importance", minImp)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit * 3);

    if (opts.agent_id) query = query.eq("agent_id", opts.agent_id);
    if (tokens.length > 0) {
      const tsQuery = tokens.map((t: string) => `${t}:*`).join(" | ");
      query = query.textSearch("fts", tsQuery, { config: "simple" });
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.slice(0, limit).map((m) => ({
      id: m.id,
      title: m.title,
      summary: m.summary ?? "",
      category: m.category,
      importance: m.importance,
      created_at: m.created_at,
    }));
  } catch (e) {
    console.error("[agent-memory] FTS recall error:", errorMessage(e));
    return [];
  }
}

/**
 * Save a Carmen memory directly (used by save_memory tool to keep agent_memory in sync).
 */
export async function saveAgentMemory(opts: {
  supabase: DbClient;
  tenant_id: string;
  agent_id: string | null;
  category: string;
  title: string;
  summary: string;
  importance?: number;
  metadata?: Json;
}) {
  try {
    if (!opts.summary?.trim() || !opts.agent_id) return;
    const category = opts.category || "fact";
    const title = String(opts.title || opts.category).slice(0, 200);
    const summary = String(opts.summary).slice(0, 2000);
    const emb = await embed(`${title}\n${summary}`);
    const row = {
      tenant_id: opts.tenant_id,
      agent_id: opts.agent_id,
      category,
      title,
      summary,
      summary_embedding: embeddingText(emb),
      importance: Math.min(100, Math.max(1, opts.importance ?? 70)),
      metadata: opts.metadata || {},
      updated_at: new Date().toISOString(),
    };
    const isInstruction =
      category === "instructions" || category === "instruction";
    if (isInstruction) {
      const { data: existing } = await opts.supabase
        .from("agent_memory")
        .select("id")
        .eq("tenant_id", opts.tenant_id)
        .eq("agent_id", opts.agent_id)
        .eq("category", category)
        .eq("title", title)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await opts.supabase
          .from("agent_memory")
          .update(row)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await opts.supabase.from("agent_memory").insert(row);
        if (error) throw error;
      }
      return;
    }
    await opts.supabase.from("agent_memory").insert(row);
  } catch (e) {
    console.error("[agent-memory] save error:", errorMessage(e));
  }
}
