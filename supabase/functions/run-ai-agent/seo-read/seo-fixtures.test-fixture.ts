import type { SeoToolContext } from "./context.ts";

type Row = Record<string, unknown>;

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
export const CLIENT_ID = "33333333-3333-4333-8333-333333333333";

/** The client every test reads, on example.co.il. */
export function clientRow(overrides: Row = {}): Row {
  return {
    id: CLIENT_ID,
    name: "שיפוצי אבי",
    tenant_id: TENANT,
    website: "https://www.example.co.il/",
    ahrefs_domain: null,
    gsc_site_url: null,
    ...overrides,
  };
}

/** A caller in TENANT whose access check passes unless `deny` is given. */
export function seoCtx(deny?: Error): SeoToolContext {
  return {
    tenantId: TENANT,
    accessibleTenantIds: [TENANT],
    assertClientAccess: () => (deny ? Promise.reject(deny) : Promise.resolve()),
    now: () => new Date("2026-11-19T10:00:00Z"),
  };
}

/** `key` of each item of a list (for asserting the order of an answer's rows). */
export function pluck(list: unknown, key: string): Array<unknown> {
  return Array.isArray(list) ? list.map((item) => item?.[key]) : [];
}
