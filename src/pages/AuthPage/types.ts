export type NavigateToApp = (
  userId: string,
  accessToken?: string,
) => Promise<boolean>;

export interface AuthDestination {
  userId: string;
  accessToken?: string;
}

export type AuthType = "invite" | "recovery" | null;

/** Normalize untrusted URL parameters before passing auth modes to forms. */
export function parseAuthType(value: string | null): AuthType {
  return value === "invite" || value === "recovery" ? value : null;
}

export interface PasswordSignInAttempt {
  release: () => void;
  isCurrent: () => boolean;
}
