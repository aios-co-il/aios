/** A fake site row and Vercel project for the landing-domain handler tests. */
import type { LandingDomainDeps } from "./handler.ts";
import type { SiteDomainState, SiteDomainStore } from "./site-store.ts";
import type { DomainCheck, VercelLanding } from "./vercel.ts";

export const ITEM = "6f1d2b3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
export const SITE = { siteId: "site-1", tenantId: "tenant-1" };
export const NOW = new Date("2026-11-20T10:00:00Z");

/** A fake site row and Vercel project, recording what the handler does to them. */
export function setup(
  state: Partial<SiteDomainState>,
  options: {
    check?: DomainCheck;
    claimed?: Array<string>;
    addError?: Error;
    /** A save that lands right after the handler reads the site. */
    savedMeanwhile?: string;
  } = {},
) {
  const row: SiteDomainState = {
    customDomain: null,
    vercelDomain: null,
    verifiedAt: null,
    ...state,
  };
  const vercelCalls: Array<string> = [];
  const vercel: VercelLanding = {
    addDomain: (domain) => {
      vercelCalls.push(`add ${domain}`);
      return options.addError
        ? Promise.reject(options.addError)
        : Promise.resolve();
    },
    removeDomain: (domain) => {
      vercelCalls.push(`remove ${domain}`);
      return Promise.resolve();
    },
    checkDomain: (domain) => {
      vercelCalls.push(`check ${domain}`);
      return Promise.resolve(
        options.check ?? { connected: true, verified: false, records: [] },
      );
    },
  };
  const store: SiteDomainStore = {
    read: () => {
      const read = { ...row };
      if (options.savedMeanwhile) {
        row.customDomain = options.savedMeanwhile;
      }
      return Promise.resolve(read);
    },
    domainClaimed: (domain) =>
      Promise.resolve((options.claimed ?? []).includes(domain)),
    recordAttached: (_site, domain) => {
      if (row.customDomain !== domain) {
        return Promise.resolve(false);
      }
      row.vercelDomain = domain;
      return Promise.resolve(true);
    },
    recordVerification: (_site, domain, verifiedAt) => {
      if (row.customDomain === domain) {
        row.verifiedAt = verifiedAt;
      }
      return Promise.resolve();
    },
  };
  const deps: LandingDomainDeps = {
    vercel,
    siteOfProject: (itemId) =>
      Promise.resolve(itemId === ITEM ? SITE : { error: "אין גישה" }),
    store,
    now: () => NOW,
  };
  return { deps, row, vercelCalls };
}
