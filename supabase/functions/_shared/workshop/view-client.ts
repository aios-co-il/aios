/**
 * The client the user is looking at in the workshop. A new project starts for that client when
 * Carmen names none, after the same access check an explicit client_id goes through.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The client in view, sent by the workshop chat as workshop_client_id; uuid only. */
export function workshopClientIdFrom(body: Record<string, unknown>) {
  const value =
    typeof body.workshop_client_id === "string"
      ? body.workshop_client_id.trim()
      : "";
  return UUID.test(value) ? value.toLowerCase() : null;
}

export interface StartClient {
  clientId: string | null;
  /** True when the client came from the workshop view rather than from Carmen. */
  fromView: boolean;
}

/** Which client a new project starts with: the one Carmen passed, else the one in view. */
export function startProjectClient(
  explicit: unknown,
  inView: string | null | undefined,
): StartClient {
  const named = typeof explicit === "string" ? explicit.trim() : "";
  if (named) return { clientId: named, fromView: false };
  return inView
    ? { clientId: inView, fromView: true }
    : { clientId: null, fromView: false };
}

export const VIEW_CLIENT_DENIED =
  "הפרויקט נפתח בלי לקוח: אין לך הרשאה ללקוח שפתוח בסדנה. אפשר לשייך אותו ללקוח אחר מהלוח.";
