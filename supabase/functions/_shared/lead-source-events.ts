/** Lead arrival-source history: one dated row per arrival that names a source. */

/** Arrival source exactly as sent; "other" or empty means none was given. */
export function givenLeadSource(raw: unknown): string | null {
  const source = raw == null ? "" : String(raw).trim();
  return source && source.toLowerCase() !== "other" ? source : null;
}

/**
 * Add a dated row to the lead's arrival-source history. New leads get their
 * first row from a database trigger; call this for repeat arrivals.
 */
export async function recordLeadSourceEvent(
  supabase: {
    from: (table: string) => {
      insert: (
        row: Record<string, unknown>,
      ) => PromiseLike<{ error: { message?: string } | null }>;
    };
  },
  args: {
    leadId: string;
    tenantId?: string | null;
    source: unknown;
    campaignName?: string | null;
  },
): Promise<void> {
  const source = givenLeadSource(args.source);
  if (!source) return;
  const { error } = await supabase.from("lead_source_events").insert({
    lead_id: args.leadId,
    tenant_id: args.tenantId ?? null,
    source,
    campaign_name: args.campaignName?.trim() || null,
  });
  if (error) {
    console.error("⚠️ Failed to record lead source event:", error.message);
  }
}
