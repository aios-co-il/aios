// Request handling for the Meta "Data Deletion Request Callback" function.
// No supabase-js imports: index.ts wires in the Supabase-backed store, and the
// tests pass a fake one.
import { corsHeaders } from "../_shared/cors.ts";
import type { DeletionRequestStatus } from "./contract.ts";
import { parseSignedRequest } from "./signed-request.ts";

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

export interface NewDeletionRequest {
  fb_user_id: string | null;
  confirmation_code: string;
  status: "received";
  /** Meta's `issued_at` (seconds since epoch) as an ISO timestamp, if present. */
  issued_at: string | null;
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

export const CONFIRMATION_CODE_PATTERN = /^[0-9a-f]{16}$/;

// Unix seconds between 2000-01-01 and 2100-01-01.
const MIN_ISSUED_AT = 946684800;
const MAX_ISSUED_AT = 4102444800;

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
    fb_user_id: fbUserIdFrom(payload.user_id),
    confirmation_code: confirmationCode,
    status: "received",
    issued_at: issuedAtToIso(payload.issued_at),
  });

  return json({
    url: `${deps.statusPage}?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}

/** GET ?code=<confirmation_code>: status lookup used by the /data-deletion page. */
export async function handleStatusLookup(
  req: Request,
  store: DeletionRequestStore,
): Promise<Response> {
  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) return json({ error: "code is required" }, 400);
  if (!CONFIRMATION_CODE_PATTERN.test(code)) {
    return json({ error: "Unknown confirmation code" }, 404);
  }

  const row = await store.findByCode(code);
  if (!row) return json({ error: "Unknown confirmation code" }, 404);
  return json(row);
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
    const body: unknown = await req.json().catch(() => null);
    const value =
      body && typeof body === "object" && "signed_request" in body
        ? body.signed_request
        : null;
    signedRequest = typeof value === "string" ? value : null;
  } else {
    const form = await req.formData().catch(() => null);
    const value = form?.get("signed_request");
    signedRequest = typeof value === "string" ? value : null;
  }
  if (!signedRequest) return null;
  return parseSignedRequest(signedRequest, appSecret);
}

/** Converts Meta's `issued_at` (unix seconds) to ISO; null when absent or out of range. */
export function issuedAtToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < MIN_ISSUED_AT || value > MAX_ISSUED_AT) return null;
  return new Date(value * 1000).toISOString();
}

/** Meta sends `user_id` as a string or number; anything else is not an id. */
export function fbUserIdFrom(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function newConfirmationCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
