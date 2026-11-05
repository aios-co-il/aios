import { MemberAdminError } from "./member-admin.ts";

/** HTTP status per SQLSTATE that offboard/reactivate_tenant_member raise for a rule. */
const RULE_STATUS: Record<string, number> = {
  "23514": 409, // the last owner
  "42501": 403, // the actor themself, a super admin, or someone not below the actor
  "22023": 409, // a deleted member
  P0002: 404, // not a member, or not inactive
};

/** A rule the SQL function refused, as the HTTP error the caller sees; other errors pass through. */
export function ruleRefusal(error: { code?: string; message: string }): Error {
  const status = error.code ? RULE_STATUS[error.code] : undefined;
  return status
    ? new MemberAdminError(status, error.message)
    : new Error(error.message);
}
