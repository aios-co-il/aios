export type AuthSessionView = "checking" | "signIn" | "passwordSetup";
export type AuthSessionAction = AuthSessionView | "checked";

export interface AuthSessionControls {
  manual: boolean;
  navigating: boolean;
  version: number;
}

/** Keep timer/query completion from overriding an explicit password-setup screen. */
export function authSessionReducer(
  view: AuthSessionView,
  action: AuthSessionAction,
): AuthSessionView {
  return action === "checked"
    ? view === "checking"
      ? "signIn"
      : view
    : action;
}
