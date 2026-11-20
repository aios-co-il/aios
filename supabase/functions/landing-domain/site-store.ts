/** The domain columns of a landing site, read and written with the service role. */
import type { DbClient } from "../_shared/supabase-clients.ts";

/** A site and its org, as landing_site_of_project resolved them for the caller. */
export interface SiteRef {
  siteId: string;
  tenantId: string;
}

/** A site's domain state. */
export interface SiteDomainState {
  /** The domain saved in the settings panel. */
  customDomain: string | null;
  /** The domain attached to the Vercel project. */
  vercelDomain: string | null;
  /** When Vercel last verified the saved domain; null while it is not. */
  verifiedAt: string | null;
}

export interface SiteDomainStore {
  read(site: SiteRef): Promise<SiteDomainState>;
  /** True when any site, in any org, has saved the domain. */
  domainClaimed(domain: string): Promise<boolean>;
  /** Records the domain attached to the Vercel project now. */
  recordAttached(site: SiteRef, domain: string | null): Promise<void>;
  /** Records the saved domain's verification, unless the domain changed meanwhile. */
  recordVerification(
    site: SiteRef,
    domain: string,
    verifiedAt: string | null,
  ): Promise<void>;
}

/** The store on landing_sites; every site query is keyed by the site and its trusted org. */
export function siteDomainStore(db: DbClient): SiteDomainStore {
  return {
    async read(site) {
      const { data, error } = await db
        .from("landing_sites")
        .select("custom_domain, vercel_domain, custom_domain_verified_at")
        .eq("id", site.siteId)
        .eq("tenant_id", site.tenantId)
        .single();
      if (error) {
        throw new Error(`site read failed: ${error.message}`);
      }
      return {
        customDomain: data.custom_domain,
        vercelDomain: data.vercel_domain,
        verifiedAt: data.custom_domain_verified_at,
      };
    },

    async domainClaimed(domain) {
      // Across orgs on purpose: a hostname is global, like the unique index on custom_domain.
      // Only whether a row exists leaves this function.
      const { data, error } = await db
        .from("landing_sites")
        .select("id")
        .eq("custom_domain", domain)
        .limit(1);
      if (error) {
        throw new Error(`domain lookup failed: ${error.message}`);
      }
      return data.length > 0;
    },

    async recordAttached(site, domain) {
      const { error } = await db
        .from("landing_sites")
        .update({ vercel_domain: domain })
        .eq("id", site.siteId)
        .eq("tenant_id", site.tenantId);
      if (error) {
        throw new Error(`attached domain not recorded: ${error.message}`);
      }
    },

    async recordVerification(site, domain, verifiedAt) {
      const { error } = await db
        .from("landing_sites")
        .update({ custom_domain_verified_at: verifiedAt })
        .eq("id", site.siteId)
        .eq("tenant_id", site.tenantId)
        .eq("custom_domain", domain);
      if (error) {
        throw new Error(`verification not recorded: ${error.message}`);
      }
    },
  };
}
