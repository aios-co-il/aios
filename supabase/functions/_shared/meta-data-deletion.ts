// Request handling for the Meta "Data Deletion Request Callback" function.
// Runtime-neutral (no Deno or supabase-js imports) so it runs under
// `node --test`; the function entry point wires in the Supabase-backed store.
import { corsHeaders } from "./cors.ts";
import { parseSignedRequest } from "./meta-signed-request.ts";

export interface DeletionRequestStatus {
  confirmation_code: string;
  status: string;
  created_at: string;
}

export interface NewDeletionRequest {
  fb_user_id: string | null;
  confirmation_code: string;
  status: "received";
  payload: Record<string, unknown>;
}

/** Persistence for meta_data_deletion_requests; methods throw on DB errors. */
export interface DeletionRequestStore {
  findByCode(code: string): Promise<DeletionRequestStatus | null>;
  insert(row: NewDeletionRequest): Promise<void>;
}

export interface MetaDataDeletionDeps {
  store: DeletionRequestStore;
  /** FACEBOOK_APP_SECRET; undefined when the function is not configured. */
  appSecret: string | undefined;
  /** Absolute URL of the /data-deletion page Meta sends users to. */
  statusPage: string;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function newConfirmationCode(): string {
  // Short, URL-safe, unique enough for a human-visible status code.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Reads the `signed_request` Meta posts (form-encoded; JSON accepted for
 * tests), verifies its signature and returns the decoded payload, or null
 * when the body is missing, malformed or not signed with `appSecret`.
 */
export async function parseRequest(
  req: Request,
  appSecret: string,
): Promise<Record<string, unknown> | null> {
  let signedRequest: string | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    signedRequest =
      typeof body?.signed_request === "string" ? body.signed_request : null;
  } else {
    const form = await req.formData().catch(() => null);
    const value = form?.get("signed_request");
    signedRequest = typeof value === "string" ? value : null;
  }
  if (!signedRequest) return null;
  return parseSignedRequest(signedRequest, appSecret);
}

/** GET ?code=<confirmation_code>: status lookup used by the /data-deletion page. */
export async function handleStatusLookup(
  req: Request,
  store: DeletionRequestStore,
): Promise<Response> {
  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) return json({ error: "code is required" }, 400);

  const row = await store.findByCode(code);
  if (!row) return json({ error: "Unknown confirmation code" }, 404);
  return json(row);
}

/**
 * POST from Meta when a user removes the app: verify the signed request, log
 * it and answer with the status URL + confirmation code Meta expects.
 * No Facebook user id is stored on tenant_integrations, so there is nothing
 * to match and delete here; the logged request is processed manually.
 */
export async function handleMetaDeleteRequest(
  req: Request,
  deps: MetaDataDeletionDeps,
): Promise<Response> {
  if (!deps.appSecret) {
    console.error("meta-data-deletion: app secret not configured");
    return json({ error: "Not configured" }, 500);
  }

  const payload = await parseRequest(req, deps.appSecret);
  if (!payload) {
    return json({ error: "Invalid signed_request" }, 400);
  }

  const confirmationCode = newConfirmationCode();
  await deps.store.insert({
    fb_user_id: payload.user_id != null ? String(payload.user_id) : null,
    confirmation_code: confirmationCode,
    status: "received",
    payload,
  });

  return json({
    url: `${deps.statusPage}?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}

/** Routes one request; any thrown error becomes a fixed 500 "Internal error". */
export async function handleMetaDataDeletion(
  req: Request,
  deps: MetaDataDeletionDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method === "GET") return await handleStatusLookup(req, deps.store);
    if (req.method === "POST") return await handleMetaDeleteRequest(req, deps);
    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("meta-data-deletion error:", err);
    return json({ error: "Internal error" }, 500);
  }
}
