import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionInvoke";
import {
  legacySyncWindow,
  resolveSyncWindow,
  splitSyncWindow,
  type SyncDateSelection,
  type SyncWindow,
} from "./syncWindow";

/**
 * The manual sync function of each ads report type; other sync maps spread
 * this one for their ads entries.
 */
export const ADS_SYNC_FUNCTIONS = {
  facebook_insights: "sync-facebook-insights",
  facebook_ecommerce: "sync-facebook-ecommerce",
  google_ads: "sync-google-ads-data",
} as const;

/** Source names for a combined sync's summary. */
export const ADS_SYNC_LABELS: Record<AdsIntegrationType, string> = {
  facebook_insights: "Facebook",
  facebook_ecommerce: "Facebook Ecom",
  google_ads: "Google Ads",
};

export type AdsIntegrationType = keyof typeof ADS_SYNC_FUNCTIONS;

export type AdsSyncTable = { id: string; integration_type?: string | null };

export type AdsRangeSyncResult = {
  tableId: string;
  piecesDone: number;
  piecesTotal: number;
  recordsSynced: number;
  byLevel: Record<"campaign" | "adset" | "ad", number> | null;
  /** The first failed piece; the pieces before it stay written. */
  failure: { piece: SyncWindow; message: string } | null;
};

/** Sends one piece to `functionName`; resolves with the response body. */
export type InvokeSyncPiece = (
  functionName: string,
  body: Record<string, string>,
) => Promise<unknown>;

const syncResponseSchema = z
  .object({
    records_synced: z.number().optional(),
    by_level: z
      .object({
        campaign: z.number().optional(),
        adset: z.number().optional(),
        ad: z.number().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

/** Whether `table` is an ads report synced through ADS_SYNC_FUNCTIONS. */
export function isAdsSyncTable(table: AdsSyncTable): boolean {
  return adsSyncFunctionFor(table) !== null;
}

/** The source name of an ads table for a combined sync's summary, or null. */
export function adsSyncLabel(table: AdsSyncTable): string | null {
  const type = table.integration_type;
  return isAdsIntegrationType(type) ? ADS_SYNC_LABELS[type] : null;
}

/**
 * The requests that sync `selection`: its window in pieces of at most 30 days,
 * newest first. A selection with no bounded range ("all", an unfinished custom
 * range) syncs the legacy 120 days the same way, since one 120-day request
 * outlasts the edge limit on a large account.
 */
export function planSyncPieces(
  selection: SyncDateSelection,
  now: Date = new Date(),
): Array<SyncWindow> {
  return splitSyncWindow(
    resolveSyncWindow(selection, now) ?? legacySyncWindow(now),
  );
}

/**
 * Sync `pieces` of one ads table one after another, stopping at the first
 * failure. Each piece replaces only its own days, so the pieces written before
 * a failure stay.
 */
export async function syncAdsTableRange(
  table: AdsSyncTable,
  pieces: ReadonlyArray<SyncWindow>,
  options: {
    invoke?: InvokeSyncPiece;
    onPieceDone?: () => void;
  } = {},
): Promise<AdsRangeSyncResult> {
  const functionName = adsSyncFunctionFor(table);
  if (!functionName) {
    throw new Error(`Not an ads report table: ${table.integration_type}`);
  }
  const invoke = options.invoke ?? invokeSyncPiece;
  const result: AdsRangeSyncResult = {
    tableId: table.id,
    piecesDone: 0,
    piecesTotal: pieces.length,
    recordsSynced: 0,
    byLevel: null,
    failure: null,
  };
  for (const piece of pieces) {
    try {
      const body = await invoke(functionName, pieceBody(table.id, piece));
      addPieceResponse(result, body);
      result.piecesDone += 1;
      options.onPieceDone?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[adsRangeSync] ${functionName} failed for ${table.id}`,
        piece,
        error,
      );
      result.failure = { piece, message };
      break;
    }
  }
  return result;
}

/** One sync request through supabase.functions.invoke; throws the edge's reason. */
export async function invokeSyncPiece(
  functionName: string,
  body: Record<string, string>,
): Promise<unknown> {
  const response = await supabase.functions.invoke(functionName, {
    method: "POST",
    body,
  });
  if (response.error) {
    throw new Error(
      await edgeFunctionErrorMessage(response.error, "הסנכרון נכשל"),
    );
  }
  return response.data;
}

/** The table's manual sync function, or null for a non-ads table. */
function adsSyncFunctionFor(table: AdsSyncTable): string | null {
  const type = table.integration_type;
  return isAdsIntegrationType(type) ? ADS_SYNC_FUNCTIONS[type] : null;
}

/** Narrows an integration type to the ads report types. */
function isAdsIntegrationType(
  type: string | null | undefined,
): type is AdsIntegrationType {
  return (
    !!type && Object.prototype.hasOwnProperty.call(ADS_SYNC_FUNCTIONS, type)
  );
}

/** The request body: the table and the piece's days. */
function pieceBody(tableId: string, piece: SyncWindow): Record<string, string> {
  return {
    table_id: tableId,
    start_date: piece.startDate,
    end_date: piece.endDate,
  };
}

/** Adds one response's row and level counts to the running totals. */
function addPieceResponse(result: AdsRangeSyncResult, body: unknown): void {
  const parsed = syncResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.warn("[adsRangeSync] unexpected sync response", parsed.error);
    return;
  }
  result.recordsSynced += parsed.data.records_synced ?? 0;
  const byLevel = parsed.data.by_level;
  if (byLevel) {
    const totals = result.byLevel ?? { campaign: 0, adset: 0, ad: 0 };
    totals.campaign += byLevel.campaign ?? 0;
    totals.adset += byLevel.adset ?? 0;
    totals.ad += byLevel.ad ?? 0;
    result.byLevel = totals;
  }
}
