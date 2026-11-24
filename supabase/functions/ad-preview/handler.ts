/**
 * What ad-preview does for one request: finds the report table the caller may
 * read (as the signed-in user, or through an active share link), checks that
 * the ad is one of that table's ad rows, and returns Meta's preview iframe
 * address for it. Every refusal reads the same to the caller ("not_found"),
 * so a share link viewer learns nothing about other tables or ads.
 */
import { redactSyncError } from "../_shared/ads-sync/redact.ts";
import type { AdPreviewAnswer } from "./contract.ts";
import { fetchMetaPreviewSrc } from "./graph.ts";

/** The Facebook report tables whose ad rows have a preview. */
const FACEBOOK_REPORT_TYPES = new Set([
  "facebook_insights",
  "facebook_ecommerce",
]);

/** Meta ad ids are numeric; anything else never reaches the Graph URL. */
const AD_ID = /^\d{1,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_TOKEN = /^[0-9a-zA-Z_-]{16,200}$/;

/** The report table a preview is read for, as the store resolved it. */
export type ReportTable = {
  id: string;
  tenantId: string;
  integrationType: string | null;
  /** The Meta connection stored on the table, if any. */
  integrationId: string | null;
};

/** How the caller reaches the table. */
export type TableAccess =
  { kind: "user"; tableId: string } | { kind: "share"; shareToken: string };

export interface AdPreviewStore {
  /** The table as the signed-in caller reads it (RLS); null when they may not. */
  tableForUser(tableId: string): Promise<ReportTable | null>;
  /** The table of an active share link; null for an unknown or inactive link. */
  tableForShare(shareToken: string): Promise<ReportTable | null>;
  /** Whether the table has an ad-level row for this ad. */
  hasAdRow(table: ReportTable, adId: string): Promise<boolean>;
  /** The Meta token the table syncs with; null without a connection. */
  metaToken(table: ReportTable): Promise<string | null>;
}

export interface AdPreviewDeps {
  store: AdPreviewStore;
  fetch: typeof fetch;
}

/** One answer: its HTTP status and JSON body. */
export type AdPreviewReply = { status: number; body: AdPreviewAnswer };

/** Handles one parsed request body. */
export async function handleAdPreview(
  body: unknown,
  deps: AdPreviewDeps,
): Promise<AdPreviewReply> {
  const request = parseRequest(body);
  if (!request) {
    console.error("[ad-preview] rejected an invalid request body");
    return { status: 400, body: { error: "invalid_request" } };
  }
  try {
    const table = await accessibleTable(deps.store, request.access);
    if (!table || !(await deps.store.hasAdRow(table, request.adId))) {
      console.warn(
        `[ad-preview] refused ad ${request.adId} via ${request.access.kind}`,
      );
      return { status: 404, body: { error: "not_found" } };
    }
    const token = await deps.store.metaToken(table);
    if (!token) {
      console.error(`[ad-preview] no Meta token for table ${table.id}`);
      return { status: 502, body: { error: "preview_unavailable" } };
    }
    const src = await fetchMetaPreviewSrc(deps.fetch, token, request.adId);
    return { status: 200, body: { src } };
  } catch (error) {
    console.error(
      `[ad-preview] preview of ad ${request.adId} failed: ${redactSyncError(
        error instanceof Error ? error.message : error,
      )}`,
    );
    return { status: 502, body: { error: "preview_unavailable" } };
  }
}

/** The ad and how the caller reaches its table, or null for a malformed body. */
function parseRequest(
  body: unknown,
): { adId: string; access: TableAccess } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const adId = stringField(body, "ad_id");
  const shareToken = stringField(body, "share_token");
  const tableId = stringField(body, "table_id");
  if (!adId || !AD_ID.test(adId)) {
    return null;
  }
  if (shareToken) {
    return SHARE_TOKEN.test(shareToken)
      ? { adId, access: { kind: "share", shareToken } }
      : null;
  }
  return tableId && UUID.test(tableId)
    ? { adId, access: { kind: "user", tableId } }
    : null;
}

/** A trimmed string field of the body, or null. */
function stringField(body: object, name: string): string | null {
  const value: unknown = Reflect.get(body, name);
  return typeof value === "string" ? value.trim() : null;
}

/** The caller's Facebook report table, or null when it is not theirs or not a Facebook report. */
async function accessibleTable(
  store: AdPreviewStore,
  access: TableAccess,
): Promise<ReportTable | null> {
  const table =
    access.kind === "share"
      ? await store.tableForShare(access.shareToken)
      : await store.tableForUser(access.tableId);
  if (!table || !FACEBOOK_REPORT_TYPES.has(table.integrationType ?? "")) {
    return null;
  }
  return table;
}
