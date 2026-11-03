import {
  authorizeMemberChange,
  MemberAdminError,
  type MemberAdminStore,
  memberRequestOf,
} from "../_shared/user-admin/member-admin.ts";
import type { DeleteMemberResult } from "../_shared/user-admin/member-results.ts";

/**
 * Deletes a member from one organization, keeping their history: the
 * membership and roles there go, and when it was their last organization the
 * account goes too (profile kept with the name, email anonymized, login
 * soft-deleted). Every check runs before the first change; offboarding is one
 * transaction, and only the login removal can fail after it, loudly and
 * safe to retry.
 */
export async function deleteMember(
  store: MemberAdminStore,
  authorization: string | null,
  body: Record<string, unknown>,
): Promise<DeleteMemberResult> {
  const target = await authorizeMemberChange(
    store,
    authorization,
    memberRequestOf(body),
  );
  const { accountDeleted } = await store.offboard(
    target.tenantId,
    target.targetId,
    target.callerId,
    "deleted",
  );
  if (accountDeleted) {
    await removeLogin(store, target.targetId);
  }
  return {
    message: accountDeleted
      ? "User deleted; their history is kept"
      : "User removed from the organization; their history is kept",
    removedFromTenant: true,
    removedFromTenantOnly: !accountDeleted,
    accountDeleted,
  };
}

/** Soft-deletes the login; a failure says what is already done and that a retry finishes it. */
async function removeLogin(
  store: MemberAdminStore,
  userId: string,
): Promise<void> {
  try {
    await store.softDeleteLogin(userId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new MemberAdminError(
      502,
      `The user left the organization and their profile is marked deleted, but the login was not removed (${reason}). Delete again to finish.`,
    );
  }
}
