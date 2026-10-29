/** How the ad-tools gates refuse a call: a stable error code, the HTTP
 * status and, for 403s, a Hebrew message the user sees. */
import type { AdToolAccess } from "./scope.ts";

export type AdToolDenied = {
  ok: false;
  status: 400 | 401 | 403;
  error: string;
  message?: string;
};

/** A refusal with this status, code and optional Hebrew message. */
export function denied(
  status: 400 | 401 | 403,
  error: string,
  message?: string,
): AdToolDenied {
  return { ok: false, status, error, message };
}

/** 400 with this error code. */
export function invalid(error: string): AdToolDenied {
  return { ok: false, status: 400, error };
}

/** 403 target_out_of_scope, worded for the access the call needs. */
export function outOfScope(access: AdToolAccess): AdToolDenied {
  return {
    ok: false,
    status: 403,
    error: "target_out_of_scope",
    message:
      access === "write"
        ? "הלקוח או החשבון לא שייכים לארגון שלך או לסוכנות שיש לך הרשאת עריכה אליה."
        : "הלקוח או החשבון לא שייכים לארגון שלך או לסוכנות שיש לך גישה אליה.",
  };
}

/** The caller's own Meta token cannot read the object, or there is none. */
export const fbObjectUnreachable: AdToolDenied = {
  ok: false,
  status: 403,
  error: "fb_object_unreachable",
  message: "לארגון שלך אין חיבור Meta עם גישה לפריט הזה.",
};
