/**
 * The landing-pages Vercel project as landing-domain uses it: attach and detach a site's custom
 * domain, and read whether Vercel verified it and which DNS record the client still has to add.
 * The token, project and team come from secrets, read by name and never logged.
 */
import { isNonProductionAppEnv } from "../_shared/app-env.ts";
import type { DnsRecord } from "../_shared/workshop/landing/site-domain.ts";
import { field, recordsFor, text } from "./dns-records.ts";

const VERCEL_API = "https://api.vercel.com";

/** What Vercel says about a domain on the landing-pages project. */
export interface DomainCheck {
  /** The domain is attached to the project. */
  connected: boolean;
  /** Verified by Vercel, and its DNS points at Vercel. */
  verified: boolean;
  /** The records the client adds; empty once verified. */
  records: Array<DnsRecord>;
}

export interface VercelLanding {
  /** Attaches the domain to the project; a domain the project already has counts as attached. */
  addDomain(domain: string): Promise<void>;
  /** Detaches the domain from the project; one the project does not have counts as detached. */
  removeDomain(domain: string): Promise<void>;
  /** Reads the domain's verification and DNS configuration. */
  checkDomain(domain: string): Promise<DomainCheck>;
}

/** A Vercel answer that is not what the call needs; its status and code go to the logs. */
export class VercelApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly path: string,
  ) {
    super(`vercel ${path} answered ${status} ${code}`);
    this.name = "VercelApiError";
  }
}

/** The domain is attached to another Vercel project, which owns it until a person moves it. */
export class DomainInUseError extends Error {
  constructor(readonly domain: string) {
    super(`${domain} is attached to another Vercel project`);
    this.name = "DomainInUseError";
  }
}

/**
 * The project from the function's secrets. Undefined when the token or project is not set, and
 * outside Production (APP_ENV unset counts as Production, see app-env.ts): Staging blocks calls
 * to Vercel (staging-outbound.mjs), and a domain set on Staging data must never reach the live
 * project. Same rule as landingRepoFromEnv (_shared/workshop/landing/repo-env.ts).
 */
export function vercelLandingFromEnv(
  env: (name: string) => string | undefined,
  fetchImpl: typeof fetch,
): VercelLanding | undefined {
  const token = env("VERCEL_LANDING_TOKEN")?.trim();
  const projectId = env("VERCEL_LANDING_PROJECT_ID")?.trim();
  if (!token || !projectId || isNonProductionAppEnv(env("APP_ENV"))) {
    return undefined;
  }
  return vercelLanding({
    token,
    projectId,
    teamId: env("VERCEL_LANDING_TEAM_ID")?.trim() || undefined,
    fetch: fetchImpl,
  });
}

/** The Vercel REST calls for one project. */
export function vercelLanding(config: {
  token: string;
  projectId: string;
  teamId: string | undefined;
  fetch: typeof fetch;
}): VercelLanding {
  const project = `/projects/${encodeURIComponent(config.projectId)}/domains`;

  /** One call to the API; the body is null when the answer is not JSON. */
  async function call(method: string, path: string, body?: unknown) {
    const url = new URL(`${VERCEL_API}${path}`);
    if (config.teamId) {
      url.searchParams.set("teamId", config.teamId);
    }
    const response = await config.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await response.json().catch(() => null);
    return { status: response.status, json };
  }

  /** Throws the answer as a VercelApiError, with the path but no query string or token. */
  function fail(path: string, answer: { status: number; json: unknown }) {
    const error = field(answer.json, "error");
    return new VercelApiError(
      answer.status,
      text(field(error, "code")) || "unknown",
      path,
    );
  }

  /** The project's domain object; null when the project does not have the domain. */
  async function projectDomain(domain: string): Promise<unknown> {
    const path = `/v9${project}/${encodeURIComponent(domain)}`;
    const answer = await call("GET", path);
    if (answer.status === 404) {
      return null;
    }
    if (answer.status !== 200) {
      throw fail(path, answer);
    }
    return answer.json;
  }

  return {
    async addDomain(domain) {
      const path = `/v10${project}`;
      const answer = await call("POST", path, { name: domain });
      if (answer.status === 200 || answer.status === 201) {
        return;
      }
      // Vercel answers 409 both when this project already has the domain and when another
      // project does; only the first is success.
      if (answer.status === 409) {
        if (await projectDomain(domain)) {
          return;
        }
        throw new DomainInUseError(domain);
      }
      throw fail(path, answer);
    },

    async removeDomain(domain) {
      const path = `/v9${project}/${encodeURIComponent(domain)}`;
      const answer = await call("DELETE", path);
      if (answer.status !== 200 && answer.status !== 404) {
        throw fail(path, answer);
      }
    },

    async checkDomain(domain) {
      const attached = await projectDomain(domain);
      if (!attached) {
        return { connected: false, verified: false, records: [] };
      }
      const path = `/v6/domains/${encodeURIComponent(domain)}/config`;
      const config = await call("GET", path);
      if (config.status !== 200) {
        throw fail(path, config);
      }
      const verified =
        field(attached, "verified") === true &&
        field(config.json, "misconfigured") === false;
      return {
        connected: true,
        verified,
        records: verified ? [] : recordsFor(domain, attached, config.json),
      };
    },
  };
}
