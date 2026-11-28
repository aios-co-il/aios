/**
 * Whether the extension is signed in as the same user as the site it frames. The panel
 * claims Carmen's browser steps with the extension's session, and the server gives a step
 * only to the user it belongs to, so a different user here means every step is refused.
 */

/** The extension's signed-in user, as far as the comparison needs it. */
export type PanelUser = { id: string; email?: string | null };

/**
 * The notice for a user other than the site's, or null when they match, the extension is
 * signed out (the sign-in notice covers that) or the site did not say who it is.
 */
export function otherUserNotice(
  siteUserId: string | undefined,
  panelUser: PanelUser | null,
): string | null {
  if (!siteUserId || !panelUser || panelUser.id === siteUserId) {
    return null;
  }
  return `התוסף מחובר כמשתמש אחר: ${panelUser.email || panelUser.id}. התחבר באותו משתמש כמו באתר.`;
}
