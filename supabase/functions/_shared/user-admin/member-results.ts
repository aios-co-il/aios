// Response bodies of delete-user and set-user-active, shared with the
// frontend (no imports, so the app's type check can read this file).

/** delete-user: the member left the organization; their history is kept. */
export type DeleteMemberResult = {
  message: string;
  removedFromTenant: true;
  /** True while the user still has another organization (their login stays). */
  removedFromTenantOnly: boolean;
  /** True when it was their last organization: profile marked deleted, login removed. */
  accountDeleted: boolean;
};

/** set-user-active: the member's state in the organization now. */
export type SetMemberActiveResult = {
  active: boolean;
  /** True when deactivating left them no organization, so sign-in is blocked. */
  signInBlocked: boolean;
};
