/** A fake Vercel API for the landing-domain Vercel client tests. */
import { vercelLanding } from "./vercel.ts";

/** A fake Vercel API: answers by "METHOD path" and records each call. */
export function fakeVercel(answers: Record<string, [number, unknown]>) {
  const calls: Array<{ method: string; url: URL; auth: string | null }> = [];
  /** Answers one request from the table. */
  function fetchImpl(input: string | URL | Request, init?: RequestInit) {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url,
      auth: new Headers(init?.headers).get("Authorization"),
    });
    const [status, body] = answers[`${method} ${url.pathname}`] ?? [
      500,
      { error: { code: "unexpected" } },
    ];
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }
  const vercel = vercelLanding({
    token: "tok",
    projectId: "prj_1",
    teamId: "team_1",
    fetch: fetchImpl,
  });
  return { vercel, calls };
}

export const DOMAIN_PATH = "/v9/projects/prj_1/domains/lp.exsitu.co.il";
export const CONFIG_PATH = "/v6/domains/lp.exsitu.co.il/config";
