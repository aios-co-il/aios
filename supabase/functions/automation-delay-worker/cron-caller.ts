import {
  isGatewayServiceRoleRequest,
  projectServiceRoleKeys,
} from "../_shared/auth/edge-caller-auth.ts";

/**
 * True when the caller is the service role, which for this function is the
 * cron. It sends whichever service key Vault holds: a new `sb_secret_` key on
 * Staging, a legacy service-role JWT on Production, and neither need equal
 * SUPABASE_SERVICE_ROLE_KEY (AIO-503). Valid only behind the JWT gateway
 * (`verify_jwt = true`), which has already verified a JWT's signature.
 */
export function isCronCaller(
  authorization: string | null,
  env: (name: string) => string | undefined,
): boolean {
  return isGatewayServiceRoleRequest(
    authorization,
    projectServiceRoleKeys(env),
  );
}
