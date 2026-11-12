import type { AdsReportRecord } from "@/components/reports/AdsGoalTables/adsGoalTablesTypes";
import type { SharedSeoPayload } from "./sharedSeoPayload";

/** A shared table's record as public-table sends it (a full crm_records row). */
export type SharedTableRecord = AdsReportRecord & { id?: string };

/** The report table part of the public-table answer. */
export type SharedTableInfo = {
  id: string;
  name: string;
  integration_type: string | null;
  category?: string | null;
  integration_settings?: Record<string, unknown> | null;
  agency_name?: string | null;
  client_id?: string | null;
};

/** The public-table answer the shared report reads; SEO shares carry more parts. */
export type SharedTablePayload = SharedSeoPayload & {
  table?: SharedTableInfo;
  fields?: Array<{ field_key: string; field_label: string }>;
  records?: Array<SharedTableRecord>;
  error?: string;
};

/** The query key prefix of one share link; the manual ROI save invalidates it. */
export function sharedTableKey(shareToken: string) {
  return ["shared-table", shareToken] as const;
}

/**
 * Reads the share link's report from public-table. It is a public endpoint
 * read without a session, so the publishable key goes in the header.
 */
export async function fetchPublicTable(
  shareToken: string,
  query: Record<string, string>,
): Promise<SharedTablePayload> {
  const params = new URLSearchParams({ token: shareToken, ...query });
  const res = await fetch(`${publicTableUrl()}?${params.toString()}`, {
    method: "GET",
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

/** Saves the closures and revenue a viewer enters in the manual ROI card. */
export async function savePublicManualRoi(
  shareToken: string,
  manualRoi: { closures: number | null; revenue: number | null },
): Promise<void> {
  const res = await fetch(publicTableUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ token: shareToken, manual_roi: manualRoi }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

/** The public-table edge function's address. */
function publicTableUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-table`;
}
