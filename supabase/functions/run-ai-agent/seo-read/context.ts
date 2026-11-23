import type { DbClient } from "../../_shared/supabase-clients.ts";

/** The parts of the service-role client the SEO read tools query with. */
export type SeoDb = Pick<DbClient, "from">;

/**
 * Who asks and what they may reach. run-ai-agent uses the service role, so each
 * tool reads only rows of `accessibleTenantIds` and checks client access first.
 */
export type SeoToolContext = {
  tenantId: string;
  accessibleTenantIds: Array<string>;
  /** assertCallerCanAccessClient bound to the caller; throws AccessDeniedError. */
  assertClientAccess: (clientId: string) => Promise<void>;
  now?: () => Date;
};

/** A refusal Carmen relays to the user: a code and the Hebrew reason. */
export type SeoRefusal = { error: string; message: string };

/** The client a tool reports on, after the tenant and access checks. */
export type SeoClient = {
  id: string;
  name: string;
  tenantId: string;
  /** Normalised host from ahrefs_domain, website or gsc_site_url; "" when none. */
  domain: string;
  gscSiteUrl: string | null;
};

/** A source that has no data for the client, and why, in Hebrew. */
export type SeoUnavailable = {
  status:
    | "not_connected"
    | "no_site_mapped"
    | "no_data"
    | "domain_mismatch"
    | "no_domain";
  message: string;
};

/** The client fields every answer starts with. */
export function clientRef(client: SeoClient) {
  return { id: client.id, name: client.name, domain: client.domain || null };
}

/** The current time, injectable for tests. */
export function nowOf(ctx: SeoToolContext): Date {
  return ctx.now ? ctx.now() : new Date();
}

/** Throws a database error so the tool call fails loudly. */
export function throwIfError(
  label: string,
  error: { message: string } | null,
): void {
  if (error) {
    console.error(`[seo-read] ${label} failed:`, error.message);
    throw new Error(`קריאת ${label} נכשלה: ${error.message}`);
  }
}
