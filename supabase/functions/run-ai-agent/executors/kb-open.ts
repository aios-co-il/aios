import type { ToolExecutionContext } from "../tool-context.ts";

type KnowledgeSourceClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string | null,
      ): {
        maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

/** Preserves the existing kb_open executor and side-effect order. */
export async function executeKbOpen(
  args: KbOpenArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data: ptr, error: pErr } = await supabase
    .from("carmen_memory_pointers")
    .select("*")
    .eq("id", args.pointer_id)
    .in("tenant_id", accessibleTenantIds)
    .maybeSingle();
  if (pErr) {
    throw pErr;
  }
  if (!ptr) {
    return { error: "pointer not found" };
  }
  // Fetch live row from source
  let live: unknown = null;
  try {
    const tableMap: Record<string, string> = {
      client: "clients",
      campaigner: "campaigners",
      task: "tasks",
      message: "chat_messages",
      lead: "leads",
      report: "seo_reports",
      system: "",
    };
    const table = tableMap[ptr.entity_type as string] ?? ptr.entity_type;
    if (table) {
      const { data, error } = await (
        supabase as unknown as KnowledgeSourceClient
      )
        .from(table)
        .select("*")
        .eq("id", ptr.entity_id)
        .maybeSingle();
      if (error) {
        console.error("[kb-open] source query failed", error);
      }
      live = data;
    }
  } catch (error) {
    console.error("[kb-open] best-effort operation failed", error);
  }
  // Bump access count async
  supabase
    .from("carmen_memory_pointers")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", ptr.id)
    .then(({ error }) => {
      if (error) {
        console.error("[kb-open] access update failed", error);
      }
    });
  return { pointer: ptr, live };
}

type KbOpenArgs = { pointer_id: string };
