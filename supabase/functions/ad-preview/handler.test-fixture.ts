/** A fake report table, share link and Graph API for the ad-preview handler tests. */
import type { AdPreviewDeps, ReportTable } from "./handler.ts";

export const TABLE_ID = "6f1d2b3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
export const OTHER_TABLE_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
export const SHARE_TOKEN = "a".repeat(64);
export const AD_ID = "120210000000000001";
export const TOKEN = "EAAB" + "x".repeat(40);
export const PREVIEW_SRC =
  "https://www.facebook.com/ads/api/preview_iframe.php?d=AQ123&t=AQ456";

const TABLE: ReportTable = {
  id: TABLE_ID,
  tenantId: "tenant-1",
  integrationType: "facebook_insights",
  integrationId: "int-1",
};

/** A Graph previews answer whose iframe frames this address. */
export function graphPreview(src: string): unknown {
  const escaped = src.replace(/&/g, "&amp;");
  return {
    data: [
      {
        body: `<iframe src="${escaped}" width="320" height="560" scrolling="yes" style="border: none;"></iframe>`,
      },
    ],
  };
}

/**
 * The caller reads TABLE_ID; SHARE_TOKEN is the table's share link (active
 * unless shareActive is false); the table has one ad row, AD_ID.
 */
export function setup(
  options: {
    shareActive?: boolean;
    integrationType?: string;
    token?: string | null;
    graph?: { status: number; body: unknown };
  } = {},
) {
  const table = {
    ...TABLE,
    integrationType: options.integrationType ?? TABLE.integrationType,
  };
  const graphCalls: Array<{ url: string; authorization: string | null }> = [];
  /** Records each Graph call and answers with options.graph or a good preview. */
  function fetchFake(input: RequestInfo | URL, init?: RequestInit) {
    graphCalls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    const graph = options.graph ?? {
      status: 200,
      body: graphPreview(PREVIEW_SRC),
    };
    return Promise.resolve(
      new Response(JSON.stringify(graph.body), { status: graph.status }),
    );
  }
  const deps: AdPreviewDeps = {
    store: {
      tableForUser: (tableId) =>
        Promise.resolve(tableId === TABLE_ID ? table : null),
      tableForShare: (token) =>
        Promise.resolve(
          token === SHARE_TOKEN && options.shareActive !== false ? table : null,
        ),
      hasAdRow: (row, adId) =>
        Promise.resolve(row.id === TABLE_ID && adId === AD_ID),
      metaToken: () =>
        Promise.resolve(options.token === undefined ? TOKEN : options.token),
    },
    fetch: fetchFake,
  };
  return { deps, graphCalls };
}
