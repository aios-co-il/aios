// @vitest-environment node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_TABLE_SETTINGS_KEYS,
  toPublicTableSettings,
} from "../../supabase/functions/_shared/public-table-settings.ts";
import {
  facebookTableUsesMixedRows,
  isFacebookLeadsOnlyTable,
} from "@/lib/adsMetrics";
import { getCampaignType } from "@/lib/agencyCampaignData";
import { resolveAnalyticsReportMode } from "@/lib/analyticsReportMode";
import { resolveDashboardCurrency } from "@/lib/currency";
import { parseSharedReportTabs } from "@/lib/sharedReportTabs";
import { shouldUseGoogleWooAttributionOverlay } from "@/lib/wooAttribution";

const CREDENTIALS = {
  webhook_secret: "SECRET-webhook",
  access_token: "SECRET-access",
  refresh_token: "SECRET-refresh",
  api_key: "SECRET-api-key",
  api_token: "SECRET-api-token",
  bearer: "Bearer SECRET-bearer",
  client_secret: "SECRET-client",
  last_sync_outcome: { status: "failed", error: "SECRET-sync-error" },
};

const SRC_DIR = fileURLToPath(new URL("../", import.meta.url));
const SHARED_PAGES = ["pages/SharedDashboard.tsx", "pages/SharedTable.tsx"];

/** An `@/` or relative import as a .ts/.tsx path under src/, or null. */
function resolveSrcImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = join(dirname(fromFile), spec);
  else return null;
  if (base.startsWith("..")) return null;
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const file = base + suffix;
    const full = join(SRC_DIR, file);
    if (/\.tsx?$/.test(file) && existsSync(full) && statSync(full).isFile())
      return file;
  }
  return null;
}

/** The shared pages and every src/ file they import, without comments. */
function sharedPageSources(): Map<string, string> {
  const sources = new Map<string, string>();
  const queue = [...SHARED_PAGES];
  for (let file = queue.shift(); file; file = queue.shift()) {
    if (sources.has(file)) continue;
    const source = readFileSync(join(SRC_DIR, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    sources.set(file, source);
    for (const [, from, lazy] of source.matchAll(
      /\bfrom\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']/g,
    )) {
      const next = resolveSrcImport(file, from ?? lazy);
      if (next && !sources.has(next)) queue.push(next);
    }
  }
  return sources;
}

/** The shared pages read the share response as untyped JSON. */
type ShareTable = {
  id: string;
  integration_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  integration_settings?: any;
};

/** Tables as the share links load them: display choices next to credentials. */
const storedTables: ShareTable[] = [
  {
    id: "fb",
    integration_type: "facebook_insights",
    integration_settings: {
      ...CREDENTIALS,
      campaign_type: "lead",
      currency: "ILS",
    },
  },
  {
    id: "google",
    integration_type: "google_ads",
    integration_settings: {
      ...CREDENTIALS,
      campaign_type: "ecommerce",
      currency: "USD",
      use_woo_google_attribution: false,
      manual_roi: { closures: 3, revenue: 9000 },
    },
  },
  {
    id: "ga",
    integration_type: "google_analytics",
    integration_settings: { ...CREDENTIALS, default_report_mode: "leads" },
  },
  {
    id: "seo",
    integration_type: "ahrefs",
    integration_settings: {
      ...CREDENTIALS,
      shared_tabs: { gsc: false, ga: "false", maskyoo: 0 },
      targetDomain: "example.co.il",
      linkedGscLangFilter: "he",
    },
  },
  { id: "empty", integration_type: "facebook_ecommerce" },
];

const publicTables: ShareTable[] = storedTables.map((table) => ({
  ...table,
  integration_settings: toPublicTableSettings(table.integration_settings),
}));

describe("share link table settings", () => {
  it("drop every credential", () => {
    const body = JSON.stringify(publicTables);
    expect(body).not.toContain("SECRET");
    expect(body).not.toContain("webhook_secret");
    expect(body).not.toContain("last_sync_outcome");
  });

  it("leave the shared-page decisions unchanged", () => {
    expect(resolveDashboardCurrency(publicTables)).toBe(
      resolveDashboardCurrency(storedTables),
    );
    expect(resolveDashboardCurrency(publicTables)).toBe("USD");
    expect(resolveAnalyticsReportMode({ tables: publicTables })).toBe(
      resolveAnalyticsReportMode({ tables: storedTables }),
    );
    publicTables.forEach((table, index) => {
      const stored = storedTables[index].integration_settings;
      const filtered = table.integration_settings;
      expect(getCampaignType(table.integration_type, filtered)).toBe(
        getCampaignType(table.integration_type, stored),
      );
      expect(facebookTableUsesMixedRows(table.integration_type, filtered)).toBe(
        facebookTableUsesMixedRows(table.integration_type, stored),
      );
      expect(isFacebookLeadsOnlyTable(filtered)).toBe(
        isFacebookLeadsOnlyTable(stored),
      );
      expect(shouldUseGoogleWooAttributionOverlay("client-1", filtered)).toBe(
        shouldUseGoogleWooAttributionOverlay("client-1", stored),
      );
      expect(parseSharedReportTabs(filtered)).toEqual(
        parseSharedReportTabs(stored),
      );
    });
  });

  it("keep the values SharedTable reads directly", () => {
    for (const [index, table] of publicTables.entries()) {
      const stored = storedTables[index].integration_settings || {};
      const filtered = table.integration_settings;
      for (const key of [
        "currency",
        "campaign_type",
        "targetDomain",
        "linkedGscLangFilter",
        "manual_roi",
      ])
        expect(filtered[key]).toEqual(stored[key]);
    }
  });

  it("show the same tabs whatever shape shared_tabs is stored in", () => {
    const sharedTabs = { ga: false, monthly_work: "false" };
    for (const shared_tabs of [
      undefined,
      null,
      { gsc: false },
      ["seo"],
      "seo",
      "",
      false,
      0,
      { seo: { token: "SECRET-tab" } },
    ]) {
      const stored = { shared_tabs, sharedTabs };
      expect(
        parseSharedReportTabs(toPublicTableSettings(stored)),
        JSON.stringify(shared_tabs),
      ).toEqual(parseSharedReportTabs(stored));
    }
  });

  it("cover every key the shared pages and their imports read", () => {
    const reads = [
      /integration_settings(?:\s+as\s+any\))?\s*\??\.\s*([A-Za-z_]\w*)/g,
      /(?:_integrationSettings|tableSettings)\s*\??\.\s*([A-Za-z_]\w*)/g,
    ];
    const sources = sharedPageSources();
    expect(sources.size).toBeGreaterThan(SHARED_PAGES.length);
    const readBy = new Map<string, string>();
    for (const [file, source] of sources)
      for (const pattern of reads)
        for (const match of source.matchAll(pattern))
          readBy.set(match[1], file);
    expect(readBy.size).toBeGreaterThan(0);
    for (const [key, file] of readBy)
      expect(PUBLIC_TABLE_SETTINGS_KEYS, `${file} reads ${key}`).toContain(key);
  });
});
