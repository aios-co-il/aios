/**
 * Caller checks for edge functions whose callers are other edge functions,
 * crons or an external agent holding a shared secret.
 */
import { isServiceKey, timingSafeEqualStr } from "../timing-safe-equal.ts";

type SecretAuthResult =
  { ok: true; via: "secret" | "service_role" } | { ok: false };

/**
 * A body flag such as `_internal_cron: true` skips user auth only when the
 * bearer is this project's service-role key. From anyone else (the public
 * anon key, a user JWT) the flag is ignored.
 */
export function trustedInternalCron(
  body: unknown,
  authorization: string | null | undefined,
  serviceRoleKey: string | null | undefined,
): boolean {
  const flag =
    typeof body === "object" && body !== null && "_internal_cron" in body
      ? body._internal_cron
      : undefined;
  return flag === true && isServiceRoleRequest(authorization, serviceRoleKey);
}

/**
 * A shared secret (e.g. MANUS_MCP_BEARER) or the service-role key. Fails
 * closed: with the secret unset, only the service-role key is accepted.
 */
export function authorizeSecretOrServiceRole(input: {
  authorization: string | null | undefined;
  secret?: string | null;
  serviceRoleKey?: string | null;
}): SecretAuthResult {
  const token = bearerFrom(input.authorization);
  if (!token) {
    return { ok: false };
  }
  const secret = (input.secret || "").trim();
  if (secret && timingSafeEqualStr(token, secret)) {
    return { ok: true, via: "secret" };
  }
  if (isServiceKey(token, (input.serviceRoleKey || "").trim())) {
    return { ok: true, via: "service_role" };
  }
  return { ok: false };
}

/** True when the Authorization header carries this project's service-role key. */
export function isServiceRoleRequest(
  authorization: string | null | undefined,
  serviceRoleKey: string | null | undefined,
): boolean {
  return isServiceKey(
    bearerFrom(authorization) ?? "",
    (serviceRoleKey ?? "").trim(),
  );
}

/**
 * True when the caller is the service role, in a function behind the JWT
 * gateway (`verify_jwt = true` in supabase/config.toml): one of the project's
 * service keys (projectServiceRoleKeys), or a JWT whose role is service_role.
 * The crons send whichever key Vault holds: Production's is a legacy
 * service-role JWT the gateway has already verified, Staging's a new secret
 * key, and neither need equal SUPABASE_SERVICE_ROLE_KEY (AIO-503). Never use
 * it where verify_jwt is false: the role claim is read without a signature
 * check (edge-caller-auth.test.ts fails then).
 */
export function isGatewayServiceRoleRequest(
  authorization: string | null | undefined,
  serviceRoleKeys: Array<string>,
): boolean {
  const token = bearerFrom(authorization) ?? "";
  if (serviceRoleKeys.some((key) => isServiceKey(token, key.trim()))) {
    return true;
  }
  return jwtRole(token) === "service_role";
}

/**
 * The project's service keys from a function's env: the legacy
 * SUPABASE_SERVICE_ROLE_KEY and every named key in SUPABASE_SECRET_KEYS (a
 * JSON object of new `sb_secret_` keys). An unreadable SUPABASE_SECRET_KEYS is
 * logged and skipped, so the legacy key still works.
 */
export function projectServiceRoleKeys(
  env: (name: string) => string | undefined,
): Array<string> {
  const keys = [env("SUPABASE_SERVICE_ROLE_KEY") ?? ""];
  const secretKeys = env("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed: unknown = JSON.parse(secretKeys);
      if (parsed && typeof parsed === "object") {
        for (const value of Object.values(parsed)) {
          if (typeof value === "string") {
            keys.push(value);
          }
        }
      }
    } catch {
      console.error("[edge-caller-auth] SUPABASE_SECRET_KEYS is not JSON");
    }
  }
  return keys.map((key) => key.trim()).filter(Boolean);
}

/** The token of an `Authorization: Bearer <token>` header, or null. Unlike
 * automation-run-auth's bearerToken it requires the `Bearer` prefix, so a
 * header without it is never read as a token. */
export function bearerFrom(header: string | null | undefined): string | null {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() || null : null;
}

/** The `role` claim of a JWT, read without verifying the signature (the
 * gateway or `auth.getUser` verifies it). Null for anything that is not a
 * JWT, such as a shared secret or a non-JWT API key. */
export function jwtRole(token: string | null | undefined): string | null {
  const parts = (token ?? "").split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}
