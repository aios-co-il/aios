/**
 * What landing-domain does for one request: resolves the caller's site, then attaches its saved
 * custom domain to the landing-pages Vercel project ("connect", after a save) or reads its
 * verification ("status"), and records both on the site.
 */
import type { LandingDomainResult } from "../_shared/workshop/landing/site-domain.ts";
import type { SiteDomainStore, SiteRef } from "./site-store.ts";
import {
  DomainInUseError,
  VercelApiError,
  type VercelLanding,
} from "./vercel.ts";

export const NOT_PRODUCTION =
  "חיבור דומיין זמין רק ב-Production. הדומיין נשמר, והוא יחובר כשיוגדר שם.";

const BAD_REQUEST = "בקשה לא תקינה";
const VERCEL_FAILED = "החיבור ל-Vercel נכשל. נסו שוב בעוד רגע.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LandingDomainAction = "connect" | "status";

export interface LandingDomainDeps {
  /** The project from the function's secrets; undefined outside Production. */
  vercel: VercelLanding | undefined;
  /** The site of the caller's project, checked in the database as the caller (their JWT). */
  siteOfProject(itemId: string): Promise<SiteRef | { error: string }>;
  store: SiteDomainStore;
  now(): Date;
}

/** One answer: its HTTP status and JSON body. */
export interface LandingDomainReply {
  status: number;
  body: LandingDomainResult | { error: string };
}

/** Handles one parsed request body. The org and site come from the item and the JWT, never the body. */
export async function handleLandingDomain(
  body: unknown,
  deps: LandingDomainDeps,
): Promise<LandingDomainReply> {
  const request = parseRequest(body);
  if (!request) {
    console.error("landing-domain: rejected an invalid request body");
    return { status: 400, body: { error: BAD_REQUEST } };
  }
  const site = await deps.siteOfProject(request.itemId);
  if ("error" in site) {
    return { status: 403, body: { error: site.error } };
  }
  if (!deps.vercel) {
    return {
      status: 200,
      body: { available: false, message: NOT_PRODUCTION },
    };
  }
  try {
    if (request.action === "connect") {
      await connectDomain(site, deps.vercel, deps.store);
    }
    return {
      status: 200,
      body: await checkDomain(site, deps.vercel, deps.store, deps.now()),
    };
  } catch (error) {
    return failure(site, error);
  }
}

/** The action and project of a request body; null for anything else. */
function parseRequest(
  body: unknown,
): { action: LandingDomainAction; itemId: string } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const action: unknown = Reflect.get(body, "action");
  const itemId: unknown = Reflect.get(body, "item_id");
  if (
    (action !== "connect" && action !== "status") ||
    typeof itemId !== "string" ||
    !UUID.test(itemId)
  ) {
    return null;
  }
  return { action, itemId };
}

/**
 * Makes the Vercel project hold the site's saved domain: detaches the domain it attached before
 * when that changed or was removed, then records the saved one and attaches it. Recording before
 * attaching means a failed request never leaves a domain attached that the site does not name: a
 * recorded domain that did not attach is attached by the next connect, or detached (Vercel's 404
 * counts as detached) once the person clears it.
 */
async function connectDomain(
  site: SiteRef,
  vercel: VercelLanding,
  store: SiteDomainStore,
): Promise<void> {
  const { customDomain, vercelDomain } = await store.read(site);
  if (vercelDomain && vercelDomain !== customDomain) {
    // Another site may have saved the released domain since; detaching it would take it from them.
    if (await store.domainClaimed(vercelDomain)) {
      console.info(
        `landing-domain: ${vercelDomain} now belongs to another site, left attached`,
      );
    } else {
      await vercel.removeDomain(vercelDomain);
    }
  }
  if (customDomain !== vercelDomain) {
    // Only while the saved domain is still the one read above: a save made meanwhile has its own
    // connect, and this request must not attach the older domain after it.
    if (!(await store.recordAttached(site, customDomain))) {
      console.info(
        `landing-domain: site ${site.siteId} changed its domain meanwhile, left to its own connect`,
      );
      return;
    }
  }
  if (customDomain) {
    await vercel.addDomain(customDomain);
  }
}

/**
 * Reads the saved domain's state in Vercel and records its verification, which the landing build
 * reads for the page's public address.
 */
async function checkDomain(
  site: SiteRef,
  vercel: VercelLanding,
  store: SiteDomainStore,
  now: Date,
): Promise<LandingDomainResult> {
  const { customDomain, vercelDomain, verifiedAt } = await store.read(site);
  if (!customDomain) {
    return {
      available: true,
      domain: null,
      connected: false,
      verified: false,
      records: [],
    };
  }
  const check =
    vercelDomain === customDomain
      ? await vercel.checkDomain(customDomain)
      : { connected: false, verified: false, records: [] };
  const wanted = check.verified ? (verifiedAt ?? now.toISOString()) : null;
  if (wanted !== verifiedAt) {
    await store.recordVerification(site, customDomain, wanted);
  }
  return { available: true, domain: customDomain, ...check };
}

/** The answer for a failed Vercel or database step, logged without secrets. */
function failure(site: SiteRef, error: unknown): LandingDomainReply {
  if (error instanceof DomainInUseError) {
    console.error(`landing-domain: site ${site.siteId}: ${error.message}`);
    return {
      status: 409,
      body: {
        error: `הדומיין ${error.domain} כבר מחובר לפרויקט אחר ב-Vercel. צריך לנתק אותו שם לפני שמחברים אותו לכאן.`,
      },
    };
  }
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`landing-domain: site ${site.siteId} failed: ${message}`);
  return {
    status: error instanceof VercelApiError ? 502 : 500,
    body: { error: VERCEL_FAILED },
  };
}
