/** An error whose message is written for the user, so it may be returned to the browser. */
export class UserFacingError extends Error {}

/** Generic text for every other error; its details stay in the function log. */
const GENERIC_ERROR = "Something went wrong. Please try again.";

/** The message safe to return for an error: its own when user-facing, else a generic one. */
export function userFacingMessage(error: unknown): string {
  return error instanceof UserFacingError ? error.message : GENERIC_ERROR;
}
