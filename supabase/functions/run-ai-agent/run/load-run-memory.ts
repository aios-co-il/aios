import type { RunState } from "./state.ts";
import { fetchRelevantMemoryPointers } from "../../_shared/carmen-token-optimizer.ts";
/** load Run Memory in the original run order. */
export async function loadRunMemory(
  run: RunState,
): Promise<Response | string | void> {
  run.relevantLongTermMemory = [];
  if (run.tokenOptimize) {
    run.relevantLongTermMemory = await fetchRelevantMemoryPointers(
      run.supabase,
      run.memoryTenantIds,
      String(run.command_text || ""),
      8,
    );
  } else {
    const [pointerMemoryRes, episodeMemoryRes] = await Promise.all([
      run.supabase
        .from("carmen_memory_pointers")
        .select("title, summary, category, subcategory, importance, ref_date")
        .in("tenant_id", run.memoryTenantIds)
        .is("valid_until", null)
        .order("importance", { ascending: false })
        .order("ref_date", { ascending: false })
        .limit(80),
      run.supabase
        .from("carmen_memory_episodes")
        .select("topic, summary, topic_tags, importance, ref_date")
        .in("tenant_id", run.memoryTenantIds)
        .order("importance", { ascending: false })
        .order("ref_date", { ascending: false })
        .limit(50),
    ]);
    const memoryTerms = String(run.command_text || "")
      .toLocaleLowerCase("he")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term: string) => term.length >= 3);
    /** Retains the original scoreMemory helper. */
    function scoreMemory(text: string, importance: number) {
      return memoryTerms.reduce(
        (score: number, term: string) =>
          score + (text.toLocaleLowerCase("he").includes(term) ? 20 : 0),
        importance / 10,
      );
    }
    run.relevantLongTermMemory = [
      ...(pointerMemoryRes.data || []).map((row) => ({
        label: [row.category, row.subcategory].filter(Boolean).join("/"),
        text: [row.title, row.summary].filter(Boolean).join(": "),
        score: scoreMemory(
          `${row.title || ""} ${row.summary || ""}`,
          row.importance || 0,
        ),
      })),
      ...(episodeMemoryRes.data || []).map((row) => ({
        label: "episode",
        text: [row.topic, row.summary].filter(Boolean).join(": "),
        score: scoreMemory(
          `${row.topic || ""} ${row.summary || ""} ${(row.topic_tags || []).join(" ")}`,
          row.importance || 0,
        ),
      })),
    ]
      .filter((item) => item.text)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((item) => ({ label: item.label, text: item.text }));
  }
}
