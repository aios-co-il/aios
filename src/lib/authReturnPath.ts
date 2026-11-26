/**
 * The page a signed-out visitor asked for (a link Carmen sent, for example),
 * kept across the sign-in page so signing in lands there instead of home.
 *
 * The route guard sends it as `/auth?next=<path>`; the sign-in page moves it
 * to sessionStorage because Google sign-in returns to a bare `/auth`.
 */

export const AUTH_RETURN_PARAM = "next";

const RETURN_PATH_KEY = "aios-auth-return-path";

/** `/auth`, carrying the page to return to after sign-in. */
export function authPathReturningTo(path: string): string {
  return isReturnPath(path)
    ? `/auth?${AUTH_RETURN_PARAM}=${encodeURIComponent(path)}`
    : "/auth";
}

/** Keep the page to return to for this tab, when it is an in-app path. */
export function rememberAuthReturnPath(path: string | null): void {
  if (!path || !isReturnPath(path)) {
    return;
  }

  try {
    sessionStorage.setItem(RETURN_PATH_KEY, path);
  } catch (error) {
    console.warn("[auth] could not keep the return path", path, error);
  }
}

/** The kept page to return to, cleared so it is used once. */
export function takeAuthReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);

    return path && isReturnPath(path) ? path : null;
  } catch (error) {
    console.warn("[auth] could not read the return path", error);

    return null;
  }
}

/** Same-origin app paths only: no other host, and never the sign-in page. */
function isReturnPath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\") &&
    !/^\/auth(?:[/?#]|$)/.test(path)
  );
}
