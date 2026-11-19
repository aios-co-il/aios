import { AccessDeniedError } from "../../_shared/auth-helpers.ts";
import { normalizeSeoDomain } from "../../_shared/seo-sync.ts";
import { callerCanReadClientCard } from "../client-card-scope.ts";
import type {
  SeoClient,
  SeoDb,
  SeoRefusal,
  SeoToolContext,
} from "./context.ts";
import { throwIfError } from "./context.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLIENT_NOT_FOUND: SeoRefusal = {
  error: "client_not_found",
  message: "הלקוח לא נמצא בארגון שלך.",
};

/** List length when top_n is not given: the detail tools, and the overview. */
export const DEFAULT_TOP_N = 10;
export const OVERVIEW_TOP_N = 5;

/** The validated arguments every SEO read tool takes. */
export type SeoArgs = { clientId: string; topN: number };

/**
 * Validates `client_id` (a uuid) and `top_n` (1–50, else `defaultTopN`). A bad
 * value is refused, not clamped, so Carmen learns what to send.
 */
export function parseSeoArgs(
  args: Record<string, unknown>,
  defaultTopN: number,
): SeoArgs | SeoRefusal {
  const clientId = typeof args.client_id === "string" ? args.client_id : "";
  if (!UUID.test(clientId.trim())) {
    console.warn("[seo-read] rejected client_id:", args.client_id);
    return {
      error: "invalid_args",
      message:
        "נדרש client_id (מזהה לקוח בפורמט uuid). מצאי אותו קודם עם search_entities או list_clients.",
    };
  }
  const rawTopN = args.top_n ?? defaultTopN;
  const topN = Number(rawTopN);
  if (!Number.isInteger(topN) || topN < 1 || topN > 50) {
    console.warn("[seo-read] rejected top_n:", rawTopN);
    return {
      error: "invalid_args",
      message: "top_n חייב להיות מספר שלם בין 1 ל-50.",
    };
  }
  return { clientId: clientId.trim(), topN };
}

/**
 * The client, only when the caller's tenant holds it (its own, or the exact
 * agency shared with it: callerCanReadClientCard) and the caller may reach it
 * (campaigners: their client_team; team managers: their agencies).
 */
export async function resolveSeoClient(
  db: SeoDb,
  ctx: SeoToolContext,
  clientId: string,
): Promise<SeoClient | SeoRefusal> {
  // An agency share opens only that agency's clients, for managers too:
  // accessibleTenantIds alone would open the sharing tenant's other agencies.
  const readable = await callerCanReadClientCard(db, {
    clientId,
    tenantId: ctx.tenantId,
    accessibleTenantIds: ctx.accessibleTenantIds,
  });
  if (!readable) {
    return CLIENT_NOT_FOUND;
  }
  const { data, error } = await db
    .from("clients")
    .select("id, name, tenant_id, website, ahrefs_domain, gsc_site_url")
    .eq("id", clientId)
    .in("tenant_id", ctx.accessibleTenantIds)
    .maybeSingle();
  throwIfError("הלקוח", error);
  if (!data) {
    return CLIENT_NOT_FOUND;
  }
  try {
    await ctx.assertClientAccess(clientId);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { error: "access_denied", message: err.message };
    }
    throw err;
  }
  return {
    id: data.id,
    name: data.name ?? "",
    tenantId: data.tenant_id,
    domain: normalizeSeoDomain(
      data.ahrefs_domain || data.website || data.gsc_site_url,
    ),
    gscSiteUrl: data.gsc_site_url || null,
  };
}

/**
 * Same site: equal hosts, or one a subdomain of the other. Never a substring
 * test, which matched unrelated short domains in the SEO report.
 */
export function seoDomainsMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeSeoDomain(a);
  const nb = normalizeSeoDomain(b);
  if (!na || !nb) {
    return false;
  }
  return na === nb || na.endsWith(`.${nb}`) || nb.endsWith(`.${na}`);
}

/** True for a refusal rather than a value. */
export function isRefusal(value: unknown): value is SeoRefusal {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    "message" in value
  );
}
