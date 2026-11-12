import type { AgentDatabaseClient, AgentRow } from "../database-contracts.ts";

export type NormalizedAdVariant = {
  primary_text: string;
  headline: string | null;
  description: string | null;
  name: string | null;
};

export type AdVariantPreview = {
  i: number;
  name?: string | null;
  primary_text: string;
  headline?: string | null;
};

type DuplicateInput = {
  source_ad_id?: string;
  variants?: Array<NormalizedAdVariant>;
  daily_budget?: number;
  budget_level?: string;
  status?: string;
};

type PendingAdDuplicate = Pick<
  AgentRow<"agent_approval_queue">,
  "id" | "title" | "description" | "tool_name" | "created_at"
> & {
  tool_input: DuplicateInput | null;
  context: { variant_previews?: Array<AdVariantPreview> } | null;
};

/** Reuses the same newest pending approval for the source ad before any new insert. */
export async function findPendingAdDuplicate(
  supabase: AgentDatabaseClient,
  tenantId: string,
  sourceAdId: string,
) {
  const { data: existingPending } = await supabase
    .from("agent_approval_queue")
    .select(
      "id, title, description, tool_name, tool_input, context, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .eq("tool_name", "fb_duplicate_ad_variants")
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<Array<PendingAdDuplicate>>();
  return (existingPending || []).find(
    (row) =>
      row?.tool_input?.source_ad_id &&
      String(row.tool_input.source_ad_id) === String(sourceAdId),
  );
}
