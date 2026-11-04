import {
  authorizeMemberChange,
  MemberAdminError,
  type MemberAdminStore,
  type MemberTarget,
  memberRequestOf,
} from "../_shared/user-admin/member-admin.ts";
import type { SetMemberActiveResult } from "../_shared/user-admin/member-results.ts";

/**
 * Deactivates or reactivates a member of one organization. Deactivating moves
 * the membership aside (offboard_tenant_member): the member loses the
 * organization, its pickers and Carmen's lists, keeps their name in history,
 * and cannot sign in once no organization is left. Reactivating restores the
 * membership, roles and cards, and sign-in.
 */
export async function setMemberActive(
  store: MemberAdminStore,
  authorization: string | null,
  body: Record<string, unknown>,
): Promise<SetMemberActiveResult> {
  if (typeof body.active !== "boolean") {
    throw new MemberAdminError(400, "active must be true or false");
  }
  const target = await authorizeMemberChange(
    store,
    authorization,
    memberRequestOf(body),
  );
  return body.active
    ? await reactivate(store, target)
    : await deactivate(store, target);
}

/**
 * Moves an active member aside, then blocks sign-in when they have no
 * organization left. A retry on an inactive member re-applies the block, so a
 * call whose sign-in step failed can be finished.
 */
async function deactivate(
  store: MemberAdminStore,
  target: MemberTarget,
): Promise<SetMemberActiveResult> {
  if (target.membership === "deleted") {
    throw new MemberAdminError(
      409,
      "The user was deleted from this organization",
    );
  }
  const remainingTenants =
    target.membership === "inactive"
      ? await store.activeTenantCount(target.targetId)
      : (
          await store.offboard(
            target.tenantId,
            target.targetId,
            target.callerId,
            "inactive",
          )
        ).remainingTenants;
  const signInBlocked = remainingTenants === 0;
  if (signInBlocked) {
    await signIn(store, target.targetId, false, "deactivated");
  }
  return { active: false, signInBlocked };
}

/**
 * Restores an inactive member, then lets them sign in again. A retry on an
 * active member lifts the block again, so a call whose sign-in step failed
 * can be finished.
 */
async function reactivate(
  store: MemberAdminStore,
  target: MemberTarget,
): Promise<SetMemberActiveResult> {
  if (target.membership === "deleted") {
    throw new MemberAdminError(
      409,
      "The user was deleted from this organization",
    );
  }
  if (target.membership === "inactive") {
    await store.reactivate(target.tenantId, target.targetId, target.callerId);
  }
  await signIn(store, target.targetId, true, "reactivated");
  return { active: true, signInBlocked: false };
}

/** Blocks or allows sign-in; a failure says the membership change is done and a retry finishes it. */
async function signIn(
  store: MemberAdminStore,
  userId: string,
  allowed: boolean,
  done: string,
): Promise<void> {
  try {
    await store.setSignInBlocked(userId, !allowed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new MemberAdminError(
      502,
      `The user was ${done} in the organization, but sign-in was not ${allowed ? "restored" : "blocked"} (${reason}). Try again.`,
    );
  }
}
