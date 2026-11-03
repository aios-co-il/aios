/**
 * A new workshop project starts only when none is open on the board, or when the user asked for
 * a new or separate one. On Staging Carmen opened a second project while the user was working on
 * the open one, and the user's next messages went to the wrong project.
 */

/** The refusal Carmen gets when she starts a project while one is open; null lets her start it. */
export function openProjectRefusal(
  openItemId: string | null | undefined,
  userText: string | null | undefined,
) {
  if (!openItemId || asksForNewProject(userText)) {
    return null;
  }
  return {
    error: `יש פרויקט פתוח בלוח (item_id=${openItemId}). המשיכי לעבוד עליו עם הכלים שלו. פרויקט חדש נפתח רק כשהמשתמש מבקש פרויקט חדש או נפרד.`,
    open_item_id: openItemId,
  };
}

/** "פרויקט חדש", "פרוייקט נפרד", "עוד פרויקט" and the like, in the user's own message. */
export function asksForNewProject(userText: string | null | undefined) {
  return ASKS_NEW.test(userText ?? "");
}

const ASKS_NEW =
  /פרו\S{0,3}קט\S*\s+(חדש|נפרד|אחר)|(חדש|נפרד|עוד)\s+פרו\S{0,3}קט|new project/i;
