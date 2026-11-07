import type { AgentDatabaseClient } from "./database-contracts.ts";

/**
 * Live source row behind a Carmen memory pointer. Only tables of the generated schema
 * are read; anything else (including the mapped "seo_reports", which does not exist)
 * yields null, as the failed lookup did before.
 */
export async function loadKbLiveRow(
  supabase: AgentDatabaseClient,
  table: string,
  id: string | null,
): Promise<unknown> {
  switch (table) {
    case "clients":
      return (
        await supabase
          .from("clients")
          .select("*")
          .filter("id", "eq", id)
          .maybeSingle()
      ).data;
    case "campaigners":
      return (
        await supabase
          .from("campaigners")
          .select("*")
          .filter("id", "eq", id)
          .maybeSingle()
      ).data;
    case "tasks":
      return (
        await supabase
          .from("tasks")
          .select("*")
          .filter("id", "eq", id)
          .maybeSingle()
      ).data;
    case "chat_messages":
      return (
        await supabase
          .from("chat_messages")
          .select("*")
          .filter("id", "eq", id)
          .maybeSingle()
      ).data;
    case "leads":
      return (
        await supabase
          .from("leads")
          .select("*")
          .filter("id", "eq", id)
          .maybeSingle()
      ).data;
    default:
      return null;
  }
}
